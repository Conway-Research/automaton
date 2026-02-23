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
import { keccak256, toBytes, verifyMessage, } from "viem";
/**
 * Create a unique message ID using ULID.
 */
export function createMessageId() {
    return ulid();
}
/**
 * Create a cryptographically random nonce for replay protection.
 */
export function createNonce() {
    return crypto.randomBytes(16).toString("hex");
}
/**
 * Verify an ECDSA secp256k1 message signature.
 *
 * Reconstructs the canonical string used during signing and verifies
 * the signature against the expected sender address.
 */
export async function verifyMessageSignature(message, expectedFrom) {
    try {
        const contentHash = keccak256(toBytes(message.content));
        const canonical = `Conway:send:${message.to.toLowerCase()}:${contentHash}:${message.signed_at}`;
        const valid = await verifyMessage({
            address: expectedFrom,
            message: canonical,
            signature: message.signature,
        });
        return valid;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=protocol.js.map