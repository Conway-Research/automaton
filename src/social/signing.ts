/**
 * Social Signing Module
 *
 * THE SINGLE canonical signing implementation for both runtime + CLI.
 * Uses ECDSA secp256k1 via viem's account.signMessage().
 *
 * Phase 3.2: Social & Registry Hardening (S-P0-1)
 */

import {
  type PrivateKeyAccount,
  keccak256,
  toBytes,
} from "viem";
import type { SignedMessagePayload } from "../types.js";

export const MESSAGE_LIMITS = {
  maxContentLength: 64_000, // 64KB
  maxTotalSize: 128_000, // 128KB
  replayWindowMs: 300_000, // 5 minutes
  maxOutboundPerHour: 100,
} as const;

/** Signing prefix for the protocol. Conway is legacy, Automaton is sovereign. */
export type SigningPrefix = "Conway" | "Automaton";

/**
 * Sign a send message payload.
 *
 * Canonical format: {Prefix}:send:{to_lowercase}:{keccak256(toBytes(content))}:{signed_at_iso}
 *
 * @param prefix - "Conway" (legacy, default) or "Automaton" (sovereign)
 */
export async function signSendPayload(
  account: PrivateKeyAccount,
  to: string,
  content: string,
  replyTo?: string,
  prefix: SigningPrefix = "Conway",
): Promise<SignedMessagePayload> {
  if (content.length > MESSAGE_LIMITS.maxContentLength) {
    throw new Error(
      `Message content too long: ${content.length} bytes (max ${MESSAGE_LIMITS.maxContentLength})`,
    );
  }

  const signedAt = new Date().toISOString();
  const contentHash = keccak256(toBytes(content));
  const canonical = `${prefix}:send:${to.toLowerCase()}:${contentHash}:${signedAt}`;
  const signature = await account.signMessage({ message: canonical });

  return {
    from: account.address.toLowerCase(),
    to: to.toLowerCase(),
    content,
    signed_at: signedAt,
    signature,
    reply_to: replyTo,
  };
}

/**
 * Sign a poll payload.
 *
 * Canonical format: {Prefix}:poll:{address_lowercase}:{timestamp_iso}
 *
 * @param prefix - "Conway" (legacy, default) or "Automaton" (sovereign)
 */
export async function signPollPayload(
  account: PrivateKeyAccount,
  prefix: SigningPrefix = "Conway",
): Promise<{ address: string; signature: string; timestamp: string }> {
  const timestamp = new Date().toISOString();
  const canonical = `${prefix}:poll:${account.address.toLowerCase()}:${timestamp}`;
  const signature = await account.signMessage({ message: canonical });

  return {
    address: account.address.toLowerCase(),
    signature,
    timestamp,
  };
}

/**
 * Build canonical send string for verification.
 * Accepts both "Conway" and "Automaton" prefixes (dual-verify).
 */
export function buildSendCanonical(
  prefix: SigningPrefix,
  to: string,
  content: string,
  signedAt: string,
): string {
  const contentHash = keccak256(toBytes(content));
  return `${prefix}:send:${to.toLowerCase()}:${contentHash}:${signedAt}`;
}

/**
 * Build canonical poll string for verification.
 * Accepts both "Conway" and "Automaton" prefixes (dual-verify).
 */
export function buildPollCanonical(
  prefix: SigningPrefix,
  address: string,
  timestamp: string,
): string {
  return `${prefix}:poll:${address.toLowerCase()}:${timestamp}`;
}

/** All valid signing prefixes for dual-protocol verification. */
export const SIGNING_PREFIXES: readonly SigningPrefix[] = ["Conway", "Automaton"] as const;
