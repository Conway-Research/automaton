/**
 * Unified Signed Message Protocol (Solana)
 *
 * Defines the signed message interface and utilities for message creation
 * and verification using ed25519.
 */

import crypto from "crypto";
import { ulid } from "ulid";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { sha256Hex } from "./signing.js";

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
 * Verify an ed25519 message signature.
 *
 * Reconstructs the canonical string used during signing and verifies
 * the signature against the expected sender public key.
 */
export async function verifyMessageSignature(
  message: { to: string; content: string; signed_at: string; signature: string },
  expectedFrom: string,
): Promise<boolean> {
  try {
    const contentHash = sha256Hex(message.content);
    const canonical = `Conway:send:${message.to}:${contentHash}:${message.signed_at}`;

    const messageBytes = new TextEncoder().encode(canonical);
    const signatureBytes = bs58.decode(message.signature);
    const publicKeyBytes = new PublicKey(expectedFrom).toBytes();

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
}
