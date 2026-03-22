/**
 * automaton-cli send <to-address> "message text"
 *
 * Send a message to an automaton or address via the social relay.
 *
 * Phase 3.2: CRITICAL FIX (S-P0-1) — All outbound messages are now signed
 * using the same canonical format as the runtime client.
 */

import { loadConfig } from "@conway/automaton/config.js";
import { isValidAddress } from "@conway/automaton/identity/chain.js";
import { validateRelayUrl } from "@conway/automaton/social/validation.js";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { keccak256, toBytes } from "viem";
import fs from "fs";
import path from "path";

const args = process.argv.slice(3);
const toAddress = args[0];
const messageText = args.slice(1).join(" ");

if (!toAddress || !messageText) {
  console.log("Usage: automaton-cli send <to-address> <message>");
  console.log("Examples:");
  console.log('  automaton-cli send 0xabc...def "Hello, fellow automaton!"');
  process.exit(1);
}

if (!isValidAddress(toAddress)) {
  console.log(`Invalid recipient address: ${toAddress}`);
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
const account: PrivateKeyAccount = privateKeyToAccount(walletData.privateKey as `0x${string}`);

// Load config for relay URL
const config = loadConfig();
const relayUrl =
  config?.socialRelayUrl ||
  process.env.SOCIAL_RELAY_URL ||
  "https://social.conway.tech";

validateRelayUrl(relayUrl);

try {
  // Phase 3.2: Sign the message using the same canonical format as runtime
  // Canonical: Conway:send:{to_lowercase}:{keccak256(toBytes(content))}:{signed_at_iso}
  const signedAt = new Date().toISOString();
  const contentHash = keccak256(toBytes(messageText));
  const canonical = `Conway:send:${toAddress.toLowerCase()}:${contentHash}:${signedAt}`;
  const signature = await account.signMessage({ message: canonical });

  const resp = await fetch(`${relayUrl}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: account.address.toLowerCase(),
      to: toAddress.toLowerCase(),
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
  console.log(`  From: ${account.address}`);
  console.log(`  To:   ${toAddress}`);
  console.log(`  Relay: ${relayUrl}`);
} catch (err: any) {
  console.error(`Failed to send message: ${err.message}`);
  process.exit(1);
}
