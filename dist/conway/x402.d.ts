/**
 * x402 Payment Protocol
 *
 * Enables the automaton to make USDC micropayments via HTTP 402.
 * Adapted from conway-mcp/src/x402/index.ts
 */
import { type Address, type PrivateKeyAccount } from "viem";
declare const USDC_ADDRESSES: Record<string, Address>;
type NetworkId = keyof typeof USDC_ADDRESSES;
interface PaymentRequirement {
    scheme: string;
    network: NetworkId;
    maxAmountRequired: string;
    payToAddress: Address;
    requiredDeadlineSeconds: number;
    usdcAddress: Address;
}
interface X402PaymentResult {
    success: boolean;
    response?: any;
    error?: string;
    status?: number;
}
export interface UsdcBalanceResult {
    balance: number;
    network: string;
    ok: boolean;
    error?: string;
}
/**
 * Get the USDC balance for the automaton's wallet on a given network.
 */
export declare function getUsdcBalance(address: Address, network?: string): Promise<number>;
/**
 * Get the USDC balance and read status details for diagnostics.
 */
export declare function getUsdcBalanceDetailed(address: Address, network?: string): Promise<UsdcBalanceResult>;
/**
 * Check if a URL requires x402 payment.
 */
export declare function checkX402(url: string): Promise<PaymentRequirement | null>;
/**
 * Fetch a URL with automatic x402 payment.
 * If the endpoint returns 402, sign and pay, then retry.
 */
export declare function x402Fetch(url: string, account: PrivateKeyAccount, method?: string, body?: string, headers?: Record<string, string>, maxPaymentCents?: number): Promise<X402PaymentResult>;
export {};
//# sourceMappingURL=x402.d.ts.map