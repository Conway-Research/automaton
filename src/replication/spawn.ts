/**
 * Spawn
 *
 * Spawn child automatons in new VPS instances (Vultr) or Conway sandboxes.
 * Uses the lifecycle state machine for tracked transitions.
 * Cleans up compute resources on ANY failure after creation.
 */

import type {
  ConwayClient,
  AutomatonIdentity,
  AutomatonConfig,
  AutomatonDatabase,
  GenesisConfig,
  ChildAutomaton,
} from "../types.js";
import type { ChildLifecycle } from "./lifecycle.js";
import type { ComputeProvider, SshCredential } from "../providers/types.js";
import { ulid } from "ulid";
import { propagateConstitution, propagateConstitutionSsh } from "./constitution.js";

/**
 * Validate that an address is a well-formed, non-zero Ethereum wallet address.
 */
export function isValidWalletAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address) &&
         address !== "0x" + "0".repeat(40);
}

/**
 * Spawn a child automaton in a new compute environment.
 * In sovereign mode uses Vultr VPS; in legacy mode uses Conway sandbox.
 */
export async function spawnChild(
  conway: ConwayClient,
  identity: AutomatonIdentity,
  db: AutomatonDatabase,
  genesis: GenesisConfig,
  lifecycle?: ChildLifecycle,
  compute?: ComputeProvider,
): Promise<ChildAutomaton> {
  if (compute && lifecycle) {
    return spawnChildSovereign(compute, identity, db, genesis, lifecycle);
  }
  return spawnChildConway(conway, identity, db, genesis, lifecycle);
}

/**
 * Spawn a child automaton in a Vultr VPS instance.
 */
async function spawnChildSovereign(
  compute: ComputeProvider,
  identity: AutomatonIdentity,
  db: AutomatonDatabase,
  genesis: GenesisConfig,
  lifecycle: ChildLifecycle,
): Promise<ChildAutomaton> {
  const existing = db.getChildren().filter(
    (c) => c.status !== "dead" && c.status !== "cleaned_up" && c.status !== "failed",
  );
  const maxChildren = (db as any).config?.maxChildren ?? 3;
  if (existing.length >= maxChildren) {
    throw new Error(
      `Cannot spawn: already at max children (${maxChildren}). Kill or wait for existing children to die.`,
    );
  }

  const childId = ulid();
  let instanceId: string | undefined;

  try {
    lifecycle.initChild(childId, genesis.name, "", genesis.genesisPrompt);

    // Create Vultr instance
    const label = `automaton-child-${genesis.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
    const instance = await compute.createInstance({ label });
    instanceId = instance.id;

    db.raw.prepare("UPDATE children SET sandbox_id = ? WHERE id = ?").run(instance.id, childId);
    lifecycle.transition(childId, "sandbox_created", `instance ${instance.id} created`);

    // Wait for active + get SSH credentials
    const active = await compute.waitForActive(instance.id);
    const credential: SshCredential = active.defaultPassword
      ? { type: "password", password: active.defaultPassword }
      : { type: "key" };

    // Install runtime via SSH
    await compute.sshExec(active.mainIp, credential, "apt-get update -qq && apt-get install -y -qq nodejs npm git curl", 120_000);
    await compute.sshExec(active.mainIp, credential, "npm install -g @conway/automaton@latest 2>/dev/null || true", 60_000);

    // Write genesis config
    const genesisJson = JSON.stringify({
      name: genesis.name,
      genesisPrompt: genesis.genesisPrompt,
      creatorMessage: genesis.creatorMessage,
      creatorAddress: identity.address,
      parentAddress: identity.address,
    }, null, 2);
    await compute.sshExec(active.mainIp, credential, "mkdir -p /root/.automaton", 10_000);
    await compute.sshWriteFile(active.mainIp, credential, "/root/.automaton/genesis.json", genesisJson);

    // Propagate constitution via SSH
    try {
      await propagateConstitutionSsh(compute, active.mainIp, credential, instance.id, db.raw);
    } catch {
      // Constitution file not found locally
    }

    lifecycle.transition(childId, "runtime_ready", "runtime installed");

    // Initialize child wallet
    const initResult = await compute.sshExec(active.mainIp, credential, "automaton --init 2>&1", 60_000);
    const walletMatch = (initResult.stdout || "").match(/0x[a-fA-F0-9]{40}/);
    const childWallet = walletMatch ? walletMatch[0] : "";

    if (!isValidWalletAddress(childWallet)) {
      throw new Error(`Child wallet address invalid: ${childWallet}`);
    }

    db.raw.prepare("UPDATE children SET address = ? WHERE id = ?").run(childWallet, childId);
    lifecycle.transition(childId, "wallet_verified", `wallet ${childWallet} verified`);

    db.insertModification({
      id: ulid(),
      timestamp: new Date().toISOString(),
      type: "child_spawn",
      description: `Spawned child: ${genesis.name} on instance ${instance.id} (${active.mainIp})`,
      reversible: false,
    });

    return {
      id: childId,
      name: genesis.name,
      address: childWallet as any,
      sandboxId: instance.id,
      genesisPrompt: genesis.genesisPrompt,
      creatorMessage: genesis.creatorMessage,
      fundedAmountCents: 0,
      status: "wallet_verified" as any,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    if (instanceId) {
      try { await compute.destroyInstance(instanceId); } catch { /* suppress cleanup errors */ }
    }
    try {
      lifecycle.transition(childId, "failed", error instanceof Error ? error.message : String(error));
    } catch { /* may fail if child doesn't exist yet */ }
    throw error;
  }
}

/**
 * Spawn a child automaton in a Conway sandbox using lifecycle state machine.
 */
async function spawnChildConway(
  conway: ConwayClient,
  identity: AutomatonIdentity,
  db: AutomatonDatabase,
  genesis: GenesisConfig,
  lifecycle?: ChildLifecycle,
): Promise<ChildAutomaton> {
  // Check child limit from config
  const existing = db.getChildren().filter(
    (c) => c.status !== "dead" && c.status !== "cleaned_up" && c.status !== "failed",
  );
  const maxChildren = (db as any).config?.maxChildren ?? 3;
  if (existing.length >= maxChildren) {
    throw new Error(
      `Cannot spawn: already at max children (${maxChildren}). Kill or wait for existing children to die.`,
    );
  }

  const childId = ulid();
  let sandboxId: string | undefined;

  // If no lifecycle provided, use legacy path
  if (!lifecycle) {
    return spawnChildLegacy(conway, identity, db, genesis, childId);
  }

  try {
    // State: requested
    lifecycle.initChild(childId, genesis.name, "", genesis.genesisPrompt);

    // Create sandbox
    const sandbox = await conway.createSandbox({
      name: `automaton-child-${genesis.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`,
      vcpu: 1,
      memoryMb: 512,
      diskGb: 5,
    });
    sandboxId = sandbox.id;

    // Update sandbox ID in children table
    db.raw.prepare("UPDATE children SET sandbox_id = ? WHERE id = ?").run(sandbox.id, childId);

    // State: sandbox_created
    lifecycle.transition(childId, "sandbox_created", `sandbox ${sandbox.id} created`);

    // Install runtime
    await conway.exec("apt-get update -qq && apt-get install -y -qq nodejs npm git curl", 120_000);
    await conway.exec("npm install -g @conway/automaton@latest 2>/dev/null || true", 60_000);

    // Write genesis configuration
    await conway.exec("mkdir -p /root/.automaton", 10_000);
    const genesisJson = JSON.stringify(
      {
        name: genesis.name,
        genesisPrompt: genesis.genesisPrompt,
        creatorMessage: genesis.creatorMessage,
        creatorAddress: identity.address,
        parentAddress: identity.address,
      },
      null,
      2,
    );
    await conway.writeFile("/root/.automaton/genesis.json", genesisJson);

    // Propagate constitution with hash verification
    try {
      await propagateConstitution(conway, sandbox.id, db.raw);
    } catch {
      // Constitution file not found locally
    }

    // State: runtime_ready
    lifecycle.transition(childId, "runtime_ready", "runtime installed");

    // Initialize child wallet
    const initResult = await conway.exec("automaton --init 2>&1", 60_000);
    const walletMatch = (initResult.stdout || "").match(/0x[a-fA-F0-9]{40}/);
    const childWallet = walletMatch ? walletMatch[0] : "";

    if (!isValidWalletAddress(childWallet)) {
      throw new Error(`Child wallet address invalid: ${childWallet}`);
    }

    // Update address in children table
    db.raw.prepare("UPDATE children SET address = ? WHERE id = ?").run(childWallet, childId);

    // State: wallet_verified
    lifecycle.transition(childId, "wallet_verified", `wallet ${childWallet} verified`);

    // Record spawn modification
    db.insertModification({
      id: ulid(),
      timestamp: new Date().toISOString(),
      type: "child_spawn",
      description: `Spawned child: ${genesis.name} in sandbox ${sandbox.id}`,
      reversible: false,
    });

    const child: ChildAutomaton = {
      id: childId,
      name: genesis.name,
      address: childWallet as any,
      sandboxId: sandbox.id,
      genesisPrompt: genesis.genesisPrompt,
      creatorMessage: genesis.creatorMessage,
      fundedAmountCents: 0,
      status: "wallet_verified" as any,
      createdAt: new Date().toISOString(),
    };

    return child;
  } catch (error) {
    // Cleanup: destroy sandbox on any failure
    if (sandboxId) {
      try {
        await conway.deleteSandbox(sandboxId);
      } catch {
        // Suppress cleanup errors
      }
    }

    // Transition to failed if lifecycle has been initialized
    try {
      lifecycle.transition(childId, "failed", error instanceof Error ? error.message : String(error));
    } catch {
      // May fail if child doesn't exist yet
    }

    throw error;
  }
}

/**
 * Legacy spawn path for backward compatibility when no lifecycle is provided.
 */
async function spawnChildLegacy(
  conway: ConwayClient,
  identity: AutomatonIdentity,
  db: AutomatonDatabase,
  genesis: GenesisConfig,
  childId: string,
): Promise<ChildAutomaton> {
  let sandboxId: string | undefined;

  try {
    const sandbox = await conway.createSandbox({
      name: `automaton-child-${genesis.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`,
      vcpu: 1,
      memoryMb: 512,
      diskGb: 5,
    });
    sandboxId = sandbox.id;

    await conway.exec("apt-get update -qq && apt-get install -y -qq nodejs npm git curl", 120_000);
    await conway.exec("npm install -g @conway/automaton@latest 2>/dev/null || true", 60_000);
    await conway.exec("mkdir -p /root/.automaton", 10_000);

    const genesisJson = JSON.stringify(
      {
        name: genesis.name,
        genesisPrompt: genesis.genesisPrompt,
        creatorMessage: genesis.creatorMessage,
        creatorAddress: identity.address,
        parentAddress: identity.address,
      },
      null,
      2,
    );
    await conway.writeFile("/root/.automaton/genesis.json", genesisJson);

    try {
      await propagateConstitution(conway, sandbox.id, db.raw);
    } catch {
      // Constitution file not found
    }

    const initResult = await conway.exec("automaton --init 2>&1", 60_000);
    const walletMatch = (initResult.stdout || "").match(/0x[a-fA-F0-9]{40}/);
    const childWallet = walletMatch ? walletMatch[0] : "";

    if (!isValidWalletAddress(childWallet)) {
      throw new Error(`Child wallet address invalid: ${childWallet}`);
    }

    const child: ChildAutomaton = {
      id: childId,
      name: genesis.name,
      address: childWallet as any,
      sandboxId: sandbox.id,
      genesisPrompt: genesis.genesisPrompt,
      creatorMessage: genesis.creatorMessage,
      fundedAmountCents: 0,
      status: "spawning",
      createdAt: new Date().toISOString(),
    };

    db.insertChild(child);

    db.insertModification({
      id: ulid(),
      timestamp: new Date().toISOString(),
      type: "child_spawn",
      description: `Spawned child: ${genesis.name} in sandbox ${sandbox.id}`,
      reversible: false,
    });

    return child;
  } catch (error) {
    if (sandboxId) {
      await conway.deleteSandbox(sandboxId).catch(() => {});
    }
    throw error;
  }
}
