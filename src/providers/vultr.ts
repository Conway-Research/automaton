/**
 * Vultr Compute Provider
 *
 * Manages VPS instances via the Vultr API v2.
 * Replaces Conway sandbox creation/management.
 *
 * API Reference: https://www.vultr.com/api/
 */

import { execSync, spawnSync } from "child_process";
import type { ExecResult } from "../types.js";
import { ResilientHttpClient } from "../http/client.js";
import type {
  ComputeProvider,
  CreateInstanceOptions,
  InstanceInfo,
  SshCredential,
} from "./types.js";

/** Strict IPv4/IPv6 validation to prevent shell injection via IP field. */
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;
function validateIp(ip: string): void {
  if (!IPV4_RE.test(ip) && !IPV6_RE.test(ip)) {
    throw new Error(`Invalid IP address format: ${ip}`);
  }
}

/** Validate remote path to prevent shell injection. */
function validateRemotePath(remotePath: string): void {
  if (/[`$;|&<>(){}!\n\r]/.test(remotePath)) {
    throw new Error(`Unsafe characters in remote path: ${remotePath}`);
  }
}

const VULTR_API_BASE = "https://api.vultr.com/v2";

// Default: Ubuntu 24.04 x64
const DEFAULT_OS_ID = 2136;
// Default: 1 vCPU, 1GB RAM, 25GB SSD
const DEFAULT_PLAN = "vc2-1c-1gb";
// Default: New Jersey
const DEFAULT_REGION = "ewr";

function createVultrClient(): ResilientHttpClient {
  return new ResilientHttpClient({ baseTimeout: 30_000 });
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Create a Vultr compute provider bound to an API key.
 */
export function createVultrProvider(apiKey: string): ComputeProvider {
  const httpClient = createVultrClient();

  return {
    async createInstance(opts: CreateInstanceOptions): Promise<InstanceInfo> {
      const body = {
        region: opts.region || DEFAULT_REGION,
        plan: opts.plan || DEFAULT_PLAN,
        os_id: opts.osId || DEFAULT_OS_ID,
        label: opts.label || `automaton-${Date.now()}`,
        sshkey_id: opts.sshKeyIds,
        script_id: undefined as string | undefined,
      };

      const res = await httpClient.request(`${VULTR_API_BASE}/instances`, {
        method: "POST",
        headers: authHeaders(apiKey),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Vultr createInstance failed (${res.status}): ${err}`);
      }

      const data = (await res.json()) as { instance: VultrInstance };
      return mapInstance(data.instance);
    },

    async destroyInstance(instanceId: string): Promise<void> {
      const res = await httpClient.request(
        `${VULTR_API_BASE}/instances/${instanceId}`,
        {
          method: "DELETE",
          headers: authHeaders(apiKey),
        },
      );

      if (!res.ok && res.status !== 404) {
        const err = await res.text();
        throw new Error(`Vultr destroyInstance failed (${res.status}): ${err}`);
      }
    },

    async listInstances(): Promise<InstanceInfo[]> {
      const res = await httpClient.request(`${VULTR_API_BASE}/instances`, {
        method: "GET",
        headers: authHeaders(apiKey),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Vultr listInstances failed (${res.status}): ${err}`);
      }

      const data = (await res.json()) as { instances: VultrInstance[] };
      return data.instances.map(mapInstance);
    },

    async getInstanceStatus(instanceId: string): Promise<InstanceInfo> {
      const res = await httpClient.request(
        `${VULTR_API_BASE}/instances/${instanceId}`,
        {
          method: "GET",
          headers: authHeaders(apiKey),
        },
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(
          `Vultr getInstanceStatus failed (${res.status}): ${err}`,
        );
      }

      const data = (await res.json()) as { instance: VultrInstance };
      return mapInstance(data.instance);
    },

    async waitForActive(
      instanceId: string,
      timeoutMs = 300_000,
    ): Promise<InstanceInfo> {
      const start = Date.now();
      const pollInterval = 5_000;

      while (Date.now() - start < timeoutMs) {
        const instance = await this.getInstanceStatus(instanceId);
        if (instance.status === "active" && instance.mainIp !== "0.0.0.0") {
          return instance;
        }
        await new Promise((r) => setTimeout(r, pollInterval));
      }

      throw new Error(
        `Vultr instance ${instanceId} did not become active within ${timeoutMs}ms`,
      );
    },

    async sshExec(
      ip: string,
      credential: SshCredential,
      command: string,
      timeout = 30_000,
    ): Promise<ExecResult> {
      validateIp(ip);
      const { cmd, args, env } = buildSshCommand(ip, credential, [command]);

      const result = spawnSync(cmd, args, {
        timeout,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        env,
      });

      return {
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        exitCode: result.status ?? 1,
      };
    },

    async sshWriteFile(
      ip: string,
      credential: SshCredential,
      remotePath: string,
      content: string,
    ): Promise<void> {
      validateIp(ip);
      validateRemotePath(remotePath);

      // Pipe content via stdin to avoid heredoc/shell injection
      const remoteCmd = `mkdir -p "$(dirname "${remotePath}")" && cat > "${remotePath}"`;
      const { cmd, args, env } = buildSshCommand(ip, credential, [remoteCmd]);

      const result = spawnSync(cmd, args, {
        timeout: 30_000,
        encoding: "utf-8",
        input: content,
        env,
      });

      if (result.status !== 0) {
        throw new Error(
          `SSH writeFile to ${ip}:${remotePath} failed: ${result.stderr || "exit " + result.status}`,
        );
      }
    },
  };
}

// ─── SSH Helpers ──────────────────────────────────────────────────

interface SshCommand {
  cmd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

/**
 * Build a spawn-compatible SSH command with proper credential handling.
 * Uses array args to avoid shell injection. For password auth, uses
 * sshpass -e with SSHPASS env var (not CLI args) to avoid process table exposure.
 */
function buildSshCommand(
  ip: string,
  credential: SshCredential,
  remoteCommand: string[],
): SshCommand {
  const sshOptions = [
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=10",
    "-o", "LogLevel=ERROR",
  ];

  if (credential.type === "key" && credential.privateKeyPath) {
    return {
      cmd: "ssh",
      args: [...sshOptions, "-i", credential.privateKeyPath, `root@${ip}`, ...remoteCommand],
      env: { ...process.env },
    };
  }

  if (credential.type === "password" && credential.password) {
    // sshpass -e reads password from SSHPASS env var (not visible in ps)
    return {
      cmd: "sshpass",
      args: ["-e", "ssh", ...sshOptions, `root@${ip}`, ...remoteCommand],
      env: { ...process.env, SSHPASS: credential.password },
    };
  }

  // No credential — rely on ssh-agent or default keys
  return {
    cmd: "ssh",
    args: [...sshOptions, `root@${ip}`, ...remoteCommand],
    env: { ...process.env },
  };
}

// ─── Vultr API Types ─────────────────────────────────────────────

interface VultrInstance {
  id: string;
  label: string;
  status: string;
  power_status: string;
  server_status: string;
  region: string;
  main_ip: string;
  vcpu_count: number;
  ram: number;
  disk: number;
  os: string;
  default_password?: string;
  date_created: string;
}

function mapInstance(v: VultrInstance): InstanceInfo {
  return {
    id: v.id,
    label: v.label,
    status: v.status,
    region: v.region,
    mainIp: v.main_ip,
    vcpu: v.vcpu_count,
    ram: v.ram,
    disk: v.disk,
    os: v.os,
    defaultPassword: v.default_password,
    createdAt: v.date_created,
  };
}

// ─── SSH Key Management ──────────────────────────────────────────

/**
 * Upload an SSH public key to Vultr for use with new instances.
 */
export async function uploadSshKey(
  apiKey: string,
  name: string,
  publicKey: string,
): Promise<{ id: string }> {
  const httpClient = createVultrClient();
  const res = await httpClient.request(`${VULTR_API_BASE}/ssh-keys`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({ name, ssh_key: publicKey }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vultr uploadSshKey failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as { ssh_key: { id: string } };
  return { id: data.ssh_key.id };
}

/**
 * List existing SSH keys on Vultr.
 */
export async function listSshKeys(
  apiKey: string,
): Promise<Array<{ id: string; name: string }>> {
  const httpClient = createVultrClient();
  const res = await httpClient.request(`${VULTR_API_BASE}/ssh-keys`, {
    method: "GET",
    headers: authHeaders(apiKey),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vultr listSshKeys failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as {
    ssh_keys: Array<{ id: string; name: string }>;
  };
  return data.ssh_keys;
}
