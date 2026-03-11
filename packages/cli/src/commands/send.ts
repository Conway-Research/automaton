/**
 * automaton-cli send <to-address> "message text"
 *
 * Send a message to an automaton or address via the social relay.
 *
 * Phase 3.2: CRITICAL FIX (S-P0-1) — All outbound messages are now signed
 * using the same canonical format as the runtime client.
 */

import { loadConfig } from "@conway/automaton/config.js";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "crypto";
import fs from "fs";
import path from "path";

function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

const args = process.argv.slice(3);
const toAddress = args[0];
const messageText = args.slice(1).join(" ");

if (!toAddress || !messageText) {
  console.log("Usage: automaton-cli send <to-address> <message>");
  console.log("Examples:");
  console.log('  automaton-cli send 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU "Hello, fellow automaton!"');
  process.exit(1);
}

// Load wallet
const walletPath = path.join(
  process.env.HOME || "/root",
  ".automaton",
  "wallet.json",
);

if (!fs.existsSync(walletPath)) {
  console.log("No wallet found at ~/.automaton/wallet.json");
  console.log("Run: automaton --init");
  process.exit(1);
}

const walletData = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
const secretKeyBytes = bs58.decode(walletData.secretKey);
const keypair = Keypair.fromSecretKey(secretKeyBytes);
const address = keypair.publicKey.toBase58();

// Load config for relay URL
const config = loadConfig();
const relayUrl =
  config?.socialRelayUrl ||
  process.env.SOCIAL_RELAY_URL ||
  "https://social.conway.tech";

try {
  // Sign the message using the same canonical format as runtime
  // Canonical: Conway:send:{to}:{sha256(content)}:{signed_at_iso}
  const signedAt = new Date().toISOString();
  const contentHash = sha256Hex(messageText);
  const canonical = `Conway:send:${toAddress}:${contentHash}:${signedAt}`;
  const messageBytes = new TextEncoder().encode(canonical);
  const sigBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
  const signature = bs58.encode(sigBytes);

  const resp = await fetch(`${relayUrl}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: address,
      to: toAddress,
      content: messageText,
      signed_at: signedAt,
      signature,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    throw new Error(`Relay returned ${resp.status}: ${await resp.text()}`);
  }

  const result = (await resp.json()) as { id?: string };
  console.log(`Message sent (signed).`);
  console.log(`  ID:   ${result.id || "n/a"}`);
  console.log(`  From: ${address}`);
  console.log(`  To:   ${toAddress}`);
  console.log(`  Relay: ${relayUrl}`);
} catch (err: any) {
  console.error(`Failed to send message: ${err.message}`);
  process.exit(1);
}
