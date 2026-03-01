/**
 * Unified Signed Message Protocol
 *
 * Defines the signed message interface and utilities for message creation
 * and verification using ECDSA secp256k1.
 *
 * Phase 3.2: Social & Registry Hardening
 */

import crypto from "crypto";
import { ulid } from "ulid";
import {
  keccak256,
  toBytes,
  verifyMessage,
} from "viem";
import { buildSendCanonical, buildPollCanonical, SIGNING_PREFIXES } from "./signing.js";

/**
 * A fully signed social message.
 */
export interface SignedMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
  nonce: string;
  signature: string;
}

/**
 * Create a unique message ID using ULID.
 */
export function createMessageId(): string {
  return ulid();
}

/**
 * Create a cryptographically random nonce for replay protection.
 */
export function createNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Verify an ECDSA secp256k1 send-message signature.
 *
 * Dual-protocol: tries both "Conway:" and "Automaton:" prefixes so
 * messages from either protocol version are accepted.
 */
export async function verifyMessageSignature(
  message: { to: string; content: string; signed_at: string; signature: string },
  expectedFrom: string,
): Promise<boolean> {
  for (const prefix of SIGNING_PREFIXES) {
    try {
      const canonical = buildSendCanonical(prefix, message.to, message.content, message.signed_at);
      const valid = await verifyMessage({
        address: expectedFrom as `0x${string}`,
        message: canonical,
        signature: message.signature as `0x${string}`,
      });
      if (valid) return true;
    } catch {
      // Try next prefix
    }
  }
  return false;
}

/**
 * Verify an ECDSA secp256k1 poll-auth signature.
 *
 * Dual-protocol: tries both "Conway:" and "Automaton:" prefixes.
 */
export async function verifyPollSignature(
  address: string,
  timestamp: string,
  signature: string,
): Promise<boolean> {
  for (const prefix of SIGNING_PREFIXES) {
    try {
      const canonical = buildPollCanonical(prefix, address, timestamp);
      const valid = await verifyMessage({
        address: address as `0x${string}`,
        message: canonical,
        signature: signature as `0x${string}`,
      });
      if (valid) return true;
    } catch {
      // Try next prefix
    }
  }
  return false;
}
