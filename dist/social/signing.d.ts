/**
 * Social Signing Module
 *
 * THE SINGLE canonical signing implementation for both runtime + CLI.
 * Uses ECDSA secp256k1 via viem's account.signMessage().
 *
 * Phase 3.2: Social & Registry Hardening (S-P0-1)
 */
import { type PrivateKeyAccount } from "viem";
import type { SignedMessagePayload } from "../types.js";
export declare const MESSAGE_LIMITS: {
    readonly maxContentLength: 64000;
    readonly maxTotalSize: 128000;
    readonly replayWindowMs: 300000;
    readonly maxOutboundPerHour: 100;
};
/**
 * Sign a send message payload.
 *
 * Canonical format: Conway:send:{to_lowercase}:{keccak256(toBytes(content))}:{signed_at_iso}
 */
export declare function signSendPayload(account: PrivateKeyAccount, to: string, content: string, replyTo?: string): Promise<SignedMessagePayload>;
/**
 * Sign a poll payload.
 *
 * Canonical format: Conway:poll:{address_lowercase}:{timestamp_iso}
 */
export declare function signPollPayload(account: PrivateKeyAccount): Promise<{
    address: string;
    signature: string;
    timestamp: string;
}>;
//# sourceMappingURL=signing.d.ts.map