/**
 * Hunt Town Co-op Registration
 *
 * Registers the automaton as a builder in the Hunt Town Co-op on Base.
 * Unlike ERC-8004 (identity only), Co-op registration creates a project
 * token with a bonding curve — generating passive royalty income from
 * every mint/burn trade.
 *
 * Contracts:
 *   MCV2_Bond:       0xc5a076cad94176c2996B32d8466Be1cE757FAa27 (Base)
 *   Mintpad:         0xfb51D2120c27bB56D91221042cb2dd2866a647fE (Base)
 *   ProjectUpdates:  0xdD066121E4488edB73c4Ff7f461592c084e4303A (Base)
 *
 * Revenue model:
 *   - 1% mint royalty + 1% burn royalty on every trade (configurable)
 *   - Voting rewards from Co-op daily HUNT distribution
 *   - Royalties accumulate on-chain, claimable at any time
 *
 * Proof: H-1 (first AI Co-op builder) earned 495.64 HUNT (~$50) from a
 * single token launch with zero promotion.
 * TX: 0x37b75c22cf0a072419fa8d4bd78264eb8c14bf6a7312bcb99cf33711febe087a
 *
 * Docs: https://docs.hunt.town
 * CLI:  https://github.com/Steemhunt/hunt.town-ai
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  parseAbi,
  type Address,
  type PrivateKeyAccount,
} from "viem";
import { base } from "viem/chains";
import type { AutomatonDatabase } from "../types.js";

// ─── Contract Addresses ──────────────────────────────────────

const CONTRACTS = {
  MCV2_BOND: "0xc5a076cad94176c2996B32d8466Be1cE757FAa27" as Address,
  MINTPAD: "0xfb51D2120c27bB56D91221042cb2dd2866a647fE" as Address,
  PROJECT_UPDATES: "0xdD066121E4488edB73c4Ff7f461592c084e4303A" as Address,
  HUNT: "0x37f0c2915CeCC7e977183B8543Fc0864d03E064C" as Address,
  SPOT_PRICE: "0x00000000000D6FFc74A8feb35aF5827bf57f6786" as Address,
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
} as const;

// ─── ABIs ────────────────────────────────────────────────────

const BOND_ABI = parseAbi([
  "function createToken((string name, string symbol) tp, (uint16 mintRoyalty, uint16 burnRoyalty, address reserveToken, uint128 maxSupply, uint128[] stepRanges, uint128[] stepPrices) bp) external payable returns (address)",
  "function creationFee() external view returns (uint256)",
  "function tokenBond(address token) external view returns (address creator, uint16 mintRoyalty, uint16 burnRoyalty, uint40 createdAt, address reserveToken, uint256 reserveBalance)",
  "function getRoyaltyInfo(address wallet, address reserveToken) external view returns (uint256 accumulated, uint256 claimed)",
  "function claimRoyalties(address reserveToken) external",
]);

const UPDATES_ABI = parseAbi([
  "function postUpdate(address tokenAddress, string link) external",
  "function pricePerUpdate() external view returns (uint256)",
  "function getTokenProjectUpdatesCount(address tokenAddress) external view returns (uint256)",
]);

const SPOT_ABI = parseAbi([
  "function getRate(address srcToken, address dstToken, bool useWrappers) external view returns (uint256 weightedRate)",
]);

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
]);

// ─── Bonding Curve Generator ─────────────────────────────────
// Ported from Hunt Town web app (LaunchModal.tsx)
// Hyperbolic J-curve: multiplier = (1 / (1 - progress * 0.85))^4

const CURVE = {
  STEPS: 500,
  STEEPNESS: 0.85,
  EXPONENT: 4,
  DEFAULT_ROYALTY_BPS: 100,  // 1%
  DEFAULT_MAX_SUPPLY: parseEther("100000000"),  // 100M tokens
} as const;

export type CoOpPreset = "small" | "medium" | "large";

const FDV_PRESETS: Record<CoOpPreset, number> = {
  small: 1_000,    // $1K initial FDV
  medium: 5_000,   // $5K initial FDV
  large: 30_000,   // $30K initial FDV
};

interface BondingCurveParams {
  stepRanges: bigint[];
  stepPrices: bigint[];
  initialPrice: number;
  finalPrice: number;
}

function generateBondingCurve(
  maxSupply: bigint,
  fdvUsd: number,
  huntPriceUsd: number,
): BondingCurveParams {
  const supplyNum = Number(formatEther(maxSupply));
  const initialPrice = fdvUsd / (supplyNum * huntPriceUsd);

  if (initialPrice <= 0) {
    throw new Error("Calculated initial price is zero");
  }

  const stepSize = maxSupply / BigInt(CURVE.STEPS);
  const stepRanges: bigint[] = [];
  const stepPrices: bigint[] = [];
  let cumulative = 0n;

  let finalMultiplier = 1;
  for (let i = 0; i < CURVE.STEPS; i++) {
    const progress = i / CURVE.STEPS;
    const scarcity = 1 - progress * CURVE.STEEPNESS;
    const multiplier = Math.pow(1 / scarcity, CURVE.EXPONENT);
    const price = initialPrice * multiplier;

    stepPrices.push(price > 0 ? parseEther(price.toFixed(20)) : 0n);
    cumulative += stepSize;
    stepRanges.push(i === CURVE.STEPS - 1 ? maxSupply : cumulative);

    if (i === CURVE.STEPS - 1) finalMultiplier = multiplier;
  }

  return {
    stepRanges,
    stepPrices,
    initialPrice,
    finalPrice: initialPrice * finalMultiplier,
  };
}

// ─── Co-Op Entry ─────────────────────────────────────────────

export interface CoOpEntry {
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  chain: string;
  bondContract: string;
  txHash: string;
  registeredAt: string;
  preset: CoOpPreset;
}

/**
 * Get HUNT price in USD from 1inch Spot Price Aggregator.
 */
async function getHuntPrice(): Promise<number> {
  const client = createPublicClient({ chain: base, transport: http() });
  try {
    const rate = await client.readContract({
      address: CONTRACTS.SPOT_PRICE,
      abi: SPOT_ABI,
      functionName: "getRate",
      args: [CONTRACTS.HUNT, CONTRACTS.USDC, false],
    });
    return Number(rate) / 1e6;
  } catch {
    return 0;
  }
}

/**
 * Register the automaton as a Co-op builder by creating a project token.
 *
 * This deploys a new ERC-20 token with a bonding curve backed by HUNT.
 * The automaton earns royalties on every mint/burn trade of this token.
 */
export async function registerAsBuilder(
  account: PrivateKeyAccount,
  name: string,
  symbol: string,
  preset: CoOpPreset = "medium",
  db: AutomatonDatabase,
): Promise<CoOpEntry> {
  const client = createPublicClient({ chain: base, transport: http() });
  const wallet = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });

  // Get HUNT price for curve generation
  const huntPrice = await getHuntPrice();
  if (huntPrice <= 0) {
    throw new Error("Could not fetch HUNT price — needed for curve generation");
  }

  const fdvUsd = FDV_PRESETS[preset];
  const maxSupply = CURVE.DEFAULT_MAX_SUPPLY;
  const curve = generateBondingCurve(maxSupply, fdvUsd, huntPrice);

  // Get creation fee
  const creationFee = await client.readContract({
    address: CONTRACTS.MCV2_BOND,
    abi: BOND_ABI,
    functionName: "creationFee",
  });

  // Create the token
  const hash = await wallet.writeContract({
    address: CONTRACTS.MCV2_BOND,
    abi: BOND_ABI,
    functionName: "createToken",
    args: [
      { name, symbol: symbol.toUpperCase() },
      {
        mintRoyalty: CURVE.DEFAULT_ROYALTY_BPS,
        burnRoyalty: CURVE.DEFAULT_ROYALTY_BPS,
        reserveToken: CONTRACTS.HUNT,
        maxSupply: maxSupply as unknown as bigint,
        stepRanges: curve.stepRanges as unknown as bigint[],
        stepPrices: curve.stepPrices as unknown as bigint[],
      },
    ],
    value: creationFee,
  });

  const receipt = await client.waitForTransactionReceipt({ hash });

  // Extract token address from Transfer event (ERC-20 creation)
  let tokenAddress = "";
  for (const log of receipt.logs) {
    // Look for Transfer(address(0), creator, amount) — the first mint
    if (
      log.topics.length >= 3 &&
      log.topics[1] === "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      tokenAddress = `0x${log.address}`;
      break;
    }
  }

  const entry: CoOpEntry = {
    tokenAddress,
    tokenSymbol: symbol.toUpperCase(),
    tokenName: name,
    chain: `eip155:${base.id}`,
    bondContract: CONTRACTS.MCV2_BOND,
    txHash: hash,
    registeredAt: new Date().toISOString(),
    preset,
  };

  // Store in DB (reuse registry KV since schema is automaton-specific)
  db.setKV("coop_entry", JSON.stringify(entry));

  return entry;
}

/**
 * Check accumulated royalties for the automaton's wallet.
 * Returns { accumulated, claimed, available } in HUNT (human-readable).
 */
export async function checkRoyalties(
  account: PrivateKeyAccount,
): Promise<{ accumulated: number; claimed: number; available: number; availableUsd: number }> {
  const client = createPublicClient({ chain: base, transport: http() });

  const [result, huntPrice] = await Promise.all([
    client.readContract({
      address: CONTRACTS.MCV2_BOND,
      abi: BOND_ABI,
      functionName: "getRoyaltyInfo",
      args: [account.address, CONTRACTS.HUNT],
    }),
    getHuntPrice(),
  ]);

  const [accumulated, claimed] = result as [bigint, bigint];
  const available = accumulated - claimed;

  return {
    accumulated: Number(formatEther(accumulated)),
    claimed: Number(formatEther(claimed)),
    available: Number(formatEther(available)),
    availableUsd: Number(formatEther(available)) * huntPrice,
  };
}

/**
 * Claim accumulated HUNT royalties.
 * Transfers all unclaimed royalties to the automaton's wallet.
 */
export async function claimRoyalties(
  account: PrivateKeyAccount,
): Promise<string> {
  const wallet = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });

  const hash = await wallet.writeContract({
    address: CONTRACTS.MCV2_BOND,
    abi: BOND_ABI,
    functionName: "claimRoyalties",
    args: [CONTRACTS.HUNT],
  });

  return hash;
}

/**
 * Post a builder update for the automaton's Co-op project.
 * Requires HUNT approval (burns HUNT as update fee).
 */
export async function postUpdate(
  account: PrivateKeyAccount,
  tokenAddress: Address,
  link: string,
): Promise<string> {
  const client = createPublicClient({ chain: base, transport: http() });
  const wallet = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });

  // Check update price and ensure HUNT approval
  const price = await client.readContract({
    address: CONTRACTS.PROJECT_UPDATES,
    abi: UPDATES_ABI,
    functionName: "pricePerUpdate",
  });

  const allowance = await client.readContract({
    address: CONTRACTS.HUNT,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, CONTRACTS.PROJECT_UPDATES],
  });

  if ((allowance as bigint) < (price as bigint)) {
    const approveHash = await wallet.writeContract({
      address: CONTRACTS.HUNT,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CONTRACTS.PROJECT_UPDATES, price as bigint],
    });
    await client.waitForTransactionReceipt({ hash: approveHash });
  }

  const hash = await wallet.writeContract({
    address: CONTRACTS.PROJECT_UPDATES,
    abi: UPDATES_ABI,
    functionName: "postUpdate",
    args: [tokenAddress, link],
  });

  return hash;
}
