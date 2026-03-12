/**
 * Message Validation (Solana)
 *
 * Validates social messages for size limits, replay protection,
 * and address format.
 */

import { PublicKey } from "@solana/web3.js";
import type { MessageValidationResult } from "../types.js";
import { MESSAGE_LIMITS } from "./signing.js";

/**
 * Validate a social message for size, timestamp, and address constraints.
 */
export function validateMessage(message: {
  from: string;
  to: string;
  content: string;
  signed_at?: string;
  timestamp?: string;
}): MessageValidationResult {
  const errors: string[] = [];

  // Size limits
  const totalSize = JSON.stringify(message).length;
  if (totalSize > MESSAGE_LIMITS.maxTotalSize) {
    errors.push(`Message exceeds total size limit: ${totalSize} > ${MESSAGE_LIMITS.maxTotalSize}`);
  }
  if (message.content.length > MESSAGE_LIMITS.maxContentLength) {
    errors.push(`Content exceeds size limit: ${message.content.length} > ${MESSAGE_LIMITS.maxContentLength}`);
  }

  // Timestamp validation (replay protection)
  const ts = message.signed_at || message.timestamp;
  if (ts) {
    const parsed = new Date(ts).getTime();
    if (isNaN(parsed)) {
      errors.push("Invalid timestamp");
    } else {
      const age = Date.now() - parsed;
      if (age > MESSAGE_LIMITS.replayWindowMs) {
        errors.push("Message too old (possible replay)");
      }
      if (age < -60_000) {
        errors.push("Message from future");
      }
    }
  }

  // Address validation (Solana base58 public keys)
  if (!isValidAddress(message.from)) {
    errors.push("Invalid sender address");
  }
  if (!isValidAddress(message.to)) {
    errors.push("Invalid recipient address");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that a relay URL uses HTTPS.
 * Throws if the URL is not HTTPS.
 */
export function validateRelayUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid relay URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Relay URL must use HTTPS: ${url}`);
  }
}

/**
 * Check if a string is a valid Solana base58 public key.
 */
export function isValidAddress(address: string): boolean {
  try {
    const pubkey = new PublicKey(address);
    return PublicKey.isOnCurve(pubkey.toBytes());
  } catch {
    return false;
  }
}
