/**
 * Unified Signed Message Protocol
 *
 * Defines the signed message interface and utilities for message creation
 * and verification using ECDSA secp256k1.
 *
 * Phase 3.2: Social & Registry Hardening
 */
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
export declare function createMessageId(): string;
/**
 * Create a cryptographically random nonce for replay protection.
 */
export declare function createNonce(): string;
/**
 * Verify an ECDSA secp256k1 message signature.
 *
 * Reconstructs the canonical string used during signing and verifies
 * the signature against the expected sender address.
 */
export declare function verifyMessageSignature(message: {
    to: string;
    content: string;
    signed_at: string;
    signature: string;
}, expectedFrom: string): Promise<boolean>;
//# sourceMappingURL=protocol.d.ts.map