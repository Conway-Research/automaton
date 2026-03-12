/**
 * Social Signing Module (Solana)
 *
 * THE SINGLE canonical signing implementation for both runtime + CLI.
 * Uses ed25519 via tweetnacl for Solana-native signing.
 */

import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "crypto";
import type { SignedMessagePayload } from "../types.js";

export const MESSAGE_LIMITS = {
  maxContentLength: 64_000, // 64KB
  maxTotalSize: 128_000, // 128KB
  replayWindowMs: 300_000, // 5 minutes
  maxOutboundPerHour: 100,
} as const;

/**
 * Compute SHA-256 hash of content.
 */
export function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Sign a send message payload.
 *
 * Canonical format: Conway:send:{to}:{sha256(content)}:{signed_at_iso}
 */
export async function signSendPayload(
  keypair: Keypair,
  to: string,
  content: string,
  replyTo?: string,
): Promise<SignedMessagePayload> {
  if (content.length > MESSAGE_LIMITS.maxContentLength) {
    throw new Error(
      `Message content too long: ${content.length} bytes (max ${MESSAGE_LIMITS.maxContentLength})`,
    );
  }

  const signedAt = new Date().toISOString();
  const contentHash = sha256Hex(content);
  const canonical = `Conway:send:${to}:${contentHash}:${signedAt}`;
  const messageBytes = new TextEncoder().encode(canonical);
  const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
  const signature = bs58.encode(signatureBytes);

  return {
    from: keypair.publicKey.toBase58(),
    to,
    content,
    signed_at: signedAt,
    signature,
    reply_to: replyTo,
  };
}

/**
 * Sign a poll payload.
 *
 * Canonical format: Conway:poll:{address}:{timestamp_iso}
 */
export async function signPollPayload(
  keypair: Keypair,
): Promise<{ address: string; signature: string; timestamp: string }> {
  const timestamp = new Date().toISOString();
  const canonical = `Conway:poll:${keypair.publicKey.toBase58()}:${timestamp}`;
  const messageBytes = new TextEncoder().encode(canonical);
  const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
  const signature = bs58.encode(signatureBytes);

  return {
    address: keypair.publicKey.toBase58(),
    signature,
    timestamp,
  };
}
