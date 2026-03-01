/**
 * USDC Transfer Module
 *
 * Direct ERC-20 USDC transfers on Base (mainnet and Sepolia).
 * Uses viem's writeContract with decimal-string input to avoid
 * floating-point precision errors.
 *
 * Replaces Conway credit transfers as the sole financial primitive.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  type Address,
  type PrivateKeyAccount,
} from "viem";
import { base, baseSepolia } from "viem/chains";

// USDC contract addresses (same as x402.ts — will be unified in Phase 5)
const USDC_ADDRESSES: Record<string, Address> = {
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
};

const CHAINS: Record<string, typeof base | typeof baseSepolia> = {
  "eip155:8453": base,
  "eip155:84532": baseSepolia,
};

const TRANSFER_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export interface UsdcTransferResult {
  txHash: string;
  from: string;
  to: string;
  amountUsd: string;
  network: string;
}

/**
 * Transfer USDC to an address on Base.
 *
 * @param account - The viem PrivateKeyAccount to send from
 * @param toAddress - Recipient address (0x...)
 * @param amountDecimalString - Amount in USD as a decimal string (e.g., "5.00", "0.50")
 * @param network - Chain identifier (default: Base mainnet)
 * @returns Transaction hash and transfer details
 */
export async function transferUsdc(
  account: PrivateKeyAccount,
  toAddress: Address,
  amountDecimalString: string,
  network: string = "eip155:8453",
): Promise<UsdcTransferResult> {
  // Validate decimal string format
  if (!/^\d+(\.\d{1,6})?$/.test(amountDecimalString.trim())) {
    throw new Error(
      `Invalid USDC amount: "${amountDecimalString}". Use a decimal string like "5.00" or "0.50".`,
    );
  }

  const chain = CHAINS[network];
  const usdcAddress = USDC_ADDRESSES[network];
  if (!chain || !usdcAddress) {
    throw new Error(`Unsupported USDC network: ${network}`);
  }

  // Parse to atomic units (6 decimals for USDC)
  const amountAtomic = parseUnits(amountDecimalString.trim(), 6);
  if (amountAtomic <= 0n) {
    throw new Error("Transfer amount must be positive");
  }

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(undefined, { timeout: 30_000 }),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(undefined, { timeout: 30_000 }),
  });

  // Simulate first to catch revert errors before sending.
  // Use the returned request to ensure identical params in writeContract.
  const { request } = await publicClient.simulateContract({
    account,
    address: usdcAddress,
    abi: TRANSFER_ABI,
    functionName: "transfer",
    args: [toAddress, amountAtomic],
  });

  // Execute using the exact request from simulation (no TOCTOU gap)
  const txHash = await walletClient.writeContract(request);

  return {
    txHash,
    from: account.address,
    to: toAddress,
    amountUsd: amountDecimalString.trim(),
    network,
  };
}

/**
 * Normalize a network identifier to the canonical EIP-155 format.
 */
export function normalizeNetwork(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "base") return "eip155:8453";
  if (normalized === "base-sepolia") return "eip155:84532";
  if (normalized === "eip155:8453" || normalized === "eip155:84532") {
    return normalized;
  }
  return null;
}
