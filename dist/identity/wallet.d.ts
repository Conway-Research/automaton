/**
 * Automaton Wallet Management
 *
 * Creates and manages an EVM wallet for the automaton's identity and payments.
 * The private key is the automaton's sovereign identity.
 * Adapted from conway-mcp/src/wallet.ts
 */
import type { PrivateKeyAccount } from "viem";
export declare function getAutomatonDir(): string;
export declare function getWalletPath(): string;
/**
 * Get or create the automaton's wallet.
 * The private key IS the automaton's identity -- protect it.
 */
export declare function getWallet(): Promise<{
    account: PrivateKeyAccount;
    isNew: boolean;
}>;
/**
 * Get the wallet address without loading the full account.
 */
export declare function getWalletAddress(): string | null;
/**
 * Load the full wallet account (needed for signing).
 */
export declare function loadWalletAccount(): PrivateKeyAccount | null;
export declare function walletExists(): boolean;
//# sourceMappingURL=wallet.d.ts.map