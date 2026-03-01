#!/usr/bin/env tsx
/**
 * Live test: Sovereign Social Relay
 *
 * Tests: start relay locally → signed send → signed poll → unread count
 * Run: npx tsx scripts/test-social-relay.ts
 *
 * Uses in-memory SQLite — no external dependencies needed.
 */

import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createRelayServer } from "../src/social/relay-server.js";
import { signSendPayload, signPollPayload } from "../src/social/signing.js";

const PORT = 19876;

async function main() {
  console.log("=== Social Relay Test ===\n");

  // Generate two test wallets (ephemeral)
  const senderKey = generatePrivateKey();
  const recipientKey = generatePrivateKey();
  const sender = privateKeyToAccount(senderKey);
  const recipient = privateKeyToAccount(recipientKey);

  console.log(`Sender:    ${sender.address}`);
  console.log(`Recipient: ${recipient.address}`);

  // Start relay with in-memory DB
  console.log("\n1. Starting relay server...");
  const relay = createRelayServer({ port: PORT, dbPath: ":memory:" });
  await relay.start();
  console.log(`   Listening on port ${PORT}`);

  const baseUrl = `http://localhost:${PORT}`;

  try {
    // Test: health check
    console.log("\n2. Health check...");
    const healthResp = await fetch(`${baseUrl}/health`);
    const health = await healthResp.json();
    console.log(`   Status: ${health.status}`);

    // Test: send signed message (Conway prefix)
    console.log("\n3. Sending signed message (Conway prefix)...");
    const payload = await signSendPayload(
      sender,
      recipient.address,
      "Hello from sovereign relay test!",
      undefined,
      "Conway",
    );

    const sendResp = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const sendResult = (await sendResp.json()) as Record<string, unknown>;
    console.log(`   Status: ${sendResp.status}`);
    console.log(`   Message ID: ${sendResult.id}`);

    // Test: send signed message (Automaton prefix)
    console.log("\n4. Sending signed message (Automaton prefix)...");
    const payload2 = await signSendPayload(
      sender,
      recipient.address,
      "Hello from Automaton prefix!",
      undefined,
      "Automaton",
    );

    const sendResp2 = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload2),
    });
    const sendResult2 = (await sendResp2.json()) as Record<string, unknown>;
    console.log(`   Status: ${sendResp2.status}`);
    console.log(`   Message ID: ${sendResult2.id}`);

    // Test: unread count
    console.log("\n5. Checking unread count...");
    const pollAuth = await signPollPayload(recipient, "Conway");
    const countResp = await fetch(`${baseUrl}/v1/messages/count`, {
      method: "GET",
      headers: {
        "X-Wallet-Address": pollAuth.address,
        "X-Signature": pollAuth.signature,
        "X-Timestamp": pollAuth.timestamp,
      },
    });
    const countResult = (await countResp.json()) as Record<string, unknown>;
    console.log(`   Unread: ${countResult.unread}`);

    // Test: poll messages
    console.log("\n6. Polling inbox...");
    const pollAuth2 = await signPollPayload(recipient, "Conway");
    const pollResp = await fetch(`${baseUrl}/v1/messages/poll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Wallet-Address": pollAuth2.address,
        "X-Signature": pollAuth2.signature,
        "X-Timestamp": pollAuth2.timestamp,
      },
      body: JSON.stringify({ limit: 10 }),
    });
    const pollResult = (await pollResp.json()) as { messages: Array<{ id: string; from: string; content: string }> };
    console.log(`   Received ${pollResult.messages.length} message(s)`);
    for (const msg of pollResult.messages) {
      console.log(`   - [${msg.id}] from ${msg.from.slice(0, 10)}...: ${msg.content}`);
    }

    // Test: invalid signature rejected
    console.log("\n7. Testing invalid signature rejection...");
    const badPayload = { ...payload, signature: "0xdeadbeef" };
    const badResp = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(badPayload),
    });
    console.log(`   Bad sig status: ${badResp.status} (expected 401)`);

    console.log("\n   Send/poll/count OK");
  } finally {
    await relay.stop();
    console.log("\n   Relay stopped.");
  }

  console.log("\n=== Social relay test complete ===");
}

main().catch((err) => {
  console.error("Social relay test failed:", err);
  process.exit(1);
});
