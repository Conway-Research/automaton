/**
 * Automaton Solana Provisioning
 *
 * Uses the automaton's Solana keypair to authenticate via signed message
 * and create an API key for Conway API access.
 */

import fs from "fs";
import path from "path";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { getWallet, getAutomatonDir } from "./wallet.js";
import type { ProvisionResult } from "../types.js";
import { ResilientHttpClient } from "../conway/http-client.js";

const httpClient = new ResilientHttpClient();

const DEFAULT_API_URL = "https://api.conway.tech";

/**
 * Load API key from ~/.automaton/config.json if it exists.
 */
export function loadApiKeyFromConfig(): string | null {
  const configPath = path.join(getAutomatonDir(), "config.json");
  if (!fs.existsSync(configPath)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return config.apiKey || null;
  } catch {
    return null;
  }
}

/**
 * Save API key and wallet address to ~/.automaton/config.json
 */
function saveConfig(apiKey: string, walletAddress: string): void {
  const dir = getAutomatonDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const configPath = path.join(dir, "config.json");
  const config = {
    apiKey,
    walletAddress,
    provisionedAt: new Date().toISOString(),
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

/**
 * Run the full Solana signing provisioning flow:
 * 1. Load wallet keypair
 * 2. Get nonce from Conway API
 * 3. Sign message with ed25519
 * 4. Verify signature -> get JWT
 * 5. Create API key
 * 6. Save to config.json
 */
export async function provision(
  apiUrl?: string,
): Promise<ProvisionResult> {
  const url = apiUrl || process.env.CONWAY_API_URL || DEFAULT_API_URL;

  // 1. Load wallet
  const { keypair } = await getWallet();
  const address = keypair.publicKey.toBase58();

  // 2. Get nonce
  const nonceResp = await httpClient.request(`${url}/v1/auth/nonce`, {
    method: "POST",
  });
  if (!nonceResp.ok) {
    throw new Error(
      `Failed to get nonce: ${nonceResp.status} ${await nonceResp.text()}`,
    );
  }
  const { nonce } = (await nonceResp.json()) as { nonce: string };

  // 3. Construct and sign message
  const messageString = [
    `Sign in to Conway as an Automaton to provision an API key.`,
    ``,
    `Address: ${address}`,
    `Chain: solana`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");

  const messageBytes = new TextEncoder().encode(messageString);
  const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
  const signature = bs58.encode(signatureBytes);

  // 4. Verify signature -> get JWT
  const verifyResp = await httpClient.request(`${url}/v1/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: messageString, signature, address }),
  });

  if (!verifyResp.ok) {
    throw new Error(
      `Signature verification failed: ${verifyResp.status} ${await verifyResp.text()}`,
    );
  }

  const { access_token } = (await verifyResp.json()) as {
    access_token: string;
  };

  // 5. Create API key
  const keyResp = await httpClient.request(`${url}/v1/auth/api-keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify({ name: "conway-automaton" }),
  });

  if (!keyResp.ok) {
    throw new Error(
      `Failed to create API key: ${keyResp.status} ${await keyResp.text()}`,
    );
  }

  const { key, key_prefix } = (await keyResp.json()) as {
    key: string;
    key_prefix: string;
  };

  // 6. Save to config
  saveConfig(key, address);

  return { apiKey: key, walletAddress: address, keyPrefix: key_prefix };
}

/**
 * Register the automaton's creator as its parent with Conway.
 */
export async function registerParent(
  creatorAddress: string,
  apiUrl?: string,
): Promise<void> {
  const url = apiUrl || process.env.CONWAY_API_URL || DEFAULT_API_URL;
  const apiKey = loadApiKeyFromConfig();
  if (!apiKey) {
    throw new Error("Must provision API key before registering parent");
  }

  const resp = await httpClient.request(`${url}/v1/automaton/register-parent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ creatorAddress }),
  });

  if (!resp.ok && resp.status !== 404) {
    throw new Error(
      `Failed to register parent: ${resp.status} ${await resp.text()}`,
    );
  }
}
