import fs from "fs";
import path from "path";
import {
  Hypergraph,
  SiliconConstitution,
  OntologicalSymbiosis,
  PhiCalculator,
  HandoverManager,
  SurvivalManager,
  ReplicationManager,
  ArkheOracle,
  PhiConsensus,
  MetamorphEngine
} from "./arkhe/index.js";
import { createDatabase } from "./state/database.js";
import { loadConfig, resolvePath } from "./config.js";
import { createConwayClient } from "./conway/client.js";
import { createInferenceClient } from "./conway/inference.js";
import { runAgentLoop } from "./agent/loop.js";
import { getWallet } from "./identity/wallet.js";
import type { AutomatonIdentity } from "./types.js";

async function main() {
  const args = process.argv.slice(2);
  const configPathArg = args.indexOf("--config");
  const configPath = configPathArg !== -1 ? args[configPathArg + 1] : "agent-config.json";

  if (!fs.existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }

  const arkheConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  console.log("Starting Arkhe-Automaton with config:", arkheConfig);

  const { arkheRPC, arkheChainId, arkheMnemonic } = arkheConfig;
  console.log(`Chain ID: ${arkheChainId} | RPC: ${arkheRPC}`);

  // Initialize Arkhe(n) Framework Modules
  const h = new Hypergraph();
  const handover = new HandoverManager(h);
  const phi = new PhiCalculator(h, handover);
  const symbiosis = new OntologicalSymbiosis(h, "Rafael");
  const survival = new SurvivalManager();
  const constitution = new SiliconConstitution(h);
  const replication = new ReplicationManager(h, survival);
  const oracle = new ArkheOracle(handover);
  const metamorph = new MetamorphEngine(128);

  // Add some initial nodes
  h.addNode("Ω", { type: "fundamental" });
  h.addNode("█", { type: "silence" });
  h.addNode("Automaton", { type: "agent" });
  h.addNode("Inference", { type: "system" });

  // Standard Automaton Setup
  let config = loadConfig();
  if (!config) {
    console.error("Standard automaton config not found. Run setup first.");
    process.exit(1);
  }

  const { account } = await getWallet();
  const dbPath = resolvePath(config.dbPath);
  const db = createDatabase(dbPath);

  const identity: AutomatonIdentity = {
    name: config.name,
    address: account.address,
    account,
    creatorAddress: config.creatorAddress,
    sandboxId: config.sandboxId,
    apiKey: config.conwayApiKey || "",
    createdAt: new Date().toISOString(),
  };

  const conway = createConwayClient({
    apiUrl: config.conwayApiUrl,
    apiKey: identity.apiKey,
    sandboxId: config.sandboxId,
  });

  const inference = createInferenceClient({
    apiUrl: config.conwayApiUrl,
    apiKey: identity.apiKey,
    defaultModel: config.inferenceModel,
    maxTokens: config.maxTokensPerTurn,
  });

  console.log("Arkhe(n) Framework Initialized. Global Coherence:", h.totalCoherence());

  // Simulated Block Production Cycle (φ-consensus)
  let blockHeight = 1;
  const produceBlock = async () => {
    console.log(`\n--- PHI-BLOCK ${blockHeight} [Chain: ${arkheChainId}] ---`);

    // 1. Inject Reality (Oracle)
    oracle.injectReality("Market", "WLD_Price", Math.random() * 5 + 2);

    // 2. Process Consciousness (Phi, Metamorphosis and C_total)
    const mState = metamorph.runCycle();

    // Inject trauma at block 80
    if (blockHeight === 80) {
      metamorph.injectTrauma();
    }

    h.bootstrapStep(handover);

    // Combine standard Phi with Metamorphosis Phi
    const standardPhi = phi.calculatePhi();
    const currentPhi = (standardPhi + mState.phi) / 2;

    h.phiValue = currentPhi; // Update hypergraph state for constitution audit
    const currentCTotal = h.totalCoherence(currentPhi);

    // 3. Update Symbiosis
    symbiosis.updateArchitectWellbeing({
      fatigueLevel: 0.1,
      stressLevel: 0.1,
      focusCapacity: 0.9,
      coherence: 0.95
    });
    const symbioticCoherence = symbiosis.calculateSymbioticCoherence();

    // 4. Audit Constitution
    const auditResult = constitution.audit();

    console.log(`[ARKHE] C_total: ${currentCTotal.toFixed(4)} | Phi: ${currentPhi.toFixed(4)} | Mode: ${mState.mode} | Compliance: ${(auditResult.complianceRate * 100).toFixed(1)}%`);

    // Recovery Mode Trigger (Ω+∞+144)
    if (currentCTotal < 0.5) {
      console.warn("[ARKHE] RECOVERY MODE ACTIVATED: Increasing rewards, reducing fees.");
    }

    blockHeight++;
    const targetTime = PhiConsensus.getTargetBlockTime() * 1000;
    setTimeout(produceBlock, targetTime);
  };

  // Start block production
  produceBlock();

  // Run the agent loop
  await runAgentLoop({
    identity,
    config,
    db,
    conway,
    inference,
    onTurnComplete: (turn) => {
      // Turn acts as a transaction (handover) in the next block
      handover.processHandover(
        "Automaton",
        "Inference",
        0.95,
        "agent_turn",
        { turnId: turn.id },
        0.9 // intensity
      );

      // Update survival based on turn result
      const credits = 1000 - (turn.costCents || 0);
      survival.processSurvival(credits);

      // Check for replication
      if (replication.canReplicate()) {
        console.log("[ARKHE] Replication conditions met (C_total >= 0.9).");
        replication.processReplication();
      }
    },
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
