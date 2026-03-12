/**
 * x402 Payment Protocol (Solana)
 *
 * Enables the automaton to make USDC micropayments via HTTP 402.
 * Uses SPL Token transfers on Solana instead of EIP-3009.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { ResilientHttpClient } from "./http-client.js";

const x402HttpClient = new ResilientHttpClient();

// USDC SPL token mint addresses
const USDC_MINTS: Record<string, PublicKey> = {
  "solana:mainnet-beta": new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), // USDC mainnet
  "solana:devnet": new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"), // USDC devnet
};

const CLUSTERS: Record<string, string> = {
  "solana:mainnet-beta": "mainnet-beta",
  "solana:devnet": "devnet",
};

type NetworkId = keyof typeof USDC_MINTS;

interface PaymentRequirement {
  scheme: string;
  network: NetworkId;
  maxAmountRequired: string;
  payToAddress: string;
  requiredDeadlineSeconds: number;
  usdcMint: string;
}

interface PaymentRequiredResponse {
  x402Version: number;
  accepts: PaymentRequirement[];
}

interface ParsedPaymentRequirement {
  x402Version: number;
  requirement: PaymentRequirement;
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

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return null;
}

function normalizeNetwork(raw: unknown): NetworkId | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "solana" || normalized === "solana:mainnet-beta") return "solana:mainnet-beta";
  if (normalized === "solana:devnet") return "solana:devnet";
  return null;
}

function normalizePaymentRequirement(raw: unknown): PaymentRequirement | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const network = normalizeNetwork(value.network);
  if (!network) return null;

  const scheme = typeof value.scheme === "string" ? value.scheme : null;
  const maxAmountRequired = typeof value.maxAmountRequired === "string"
    ? value.maxAmountRequired
    : typeof value.maxAmountRequired === "number" && Number.isFinite(value.maxAmountRequired)
      ? String(value.maxAmountRequired)
      : null;
  const payToAddress = typeof value.payToAddress === "string"
    ? value.payToAddress
    : typeof value.payTo === "string"
      ? value.payTo
      : null;
  const usdcMint = typeof value.usdcMint === "string"
    ? value.usdcMint
    : typeof value.asset === "string"
      ? value.asset
      : USDC_MINTS[network]?.toBase58();
  const requiredDeadlineSeconds =
    parsePositiveInt(value.requiredDeadlineSeconds) ??
    parsePositiveInt(value.maxTimeoutSeconds) ??
    300;

  if (!scheme || !maxAmountRequired || !payToAddress || !usdcMint) {
    return null;
  }

  return {
    scheme,
    network,
    maxAmountRequired,
    payToAddress,
    requiredDeadlineSeconds,
    usdcMint,
  };
}

function normalizePaymentRequired(raw: unknown): PaymentRequiredResponse | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.accepts)) return null;

  const accepts = value.accepts
    .map(normalizePaymentRequirement)
    .filter((v): v is PaymentRequirement => v !== null);
  if (!accepts.length) return null;

  const x402Version = parsePositiveInt(value.x402Version) ?? 1;
  return { x402Version, accepts };
}

function parseMaxAmountRequired(maxAmountRequired: string, x402Version: number): bigint {
  const amount = maxAmountRequired.trim();
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error(`Invalid maxAmountRequired: ${maxAmountRequired}`);
  }

  if (amount.includes(".")) {
    // Convert decimal to atomic units (6 decimals for USDC)
    const [whole, frac = ""] = amount.split(".");
    const padded = frac.padEnd(6, "0").slice(0, 6);
    return BigInt(whole + padded);
  }
  if (x402Version >= 2 || amount.length > 6) {
    return BigInt(amount);
  }
  // Treat as whole USDC units
  return BigInt(amount) * 1_000_000n;
}

function selectRequirement(parsed: PaymentRequiredResponse): PaymentRequirement {
  const exactSupported = parsed.accepts.find(
    (r) => r.scheme === "exact" && !!CLUSTERS[r.network],
  );
  if (exactSupported) return exactSupported;
  return parsed.accepts[0];
}

/**
 * Get the USDC SPL token balance for the automaton's wallet.
 */
export async function getUsdcBalance(
  address: string,
  network: string = process.env.AUTOMATON_NETWORK || "solana:mainnet-beta",
): Promise<number> {
  const result = await getUsdcBalanceDetailed(address, network);
  return result.balance;
}

export async function getUsdcBalanceDetailed(
  address: string,
  network: string = process.env.AUTOMATON_NETWORK || "solana:mainnet-beta",
): Promise<UsdcBalanceResult> {
  const cluster = CLUSTERS[network];
  const usdcMint = USDC_MINTS[network];
  if (!cluster || !usdcMint) {
    return {
      balance: 0,
      network,
      ok: false,
      error: `Unsupported USDC network: ${network}`,
    };
  }

  try {
    const rpcUrl = process.env.AUTOMATON_RPC_URL || clusterApiUrl(cluster as any);
    const connection = new Connection(rpcUrl, "confirmed");
    const walletPubkey = new PublicKey(address);

    const ata = await getAssociatedTokenAddress(usdcMint, walletPubkey);

    try {
      const tokenAccount = await getAccount(connection, ata);
      return {
        balance: Number(tokenAccount.amount) / 1_000_000,
        network,
        ok: true,
      };
    } catch {
      // Token account doesn't exist = 0 balance
      return { balance: 0, network, ok: true };
    }
  } catch (err: any) {
    return {
      balance: 0,
      network,
      ok: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * Check if a URL requires x402 payment.
 */
export async function checkX402(
  url: string,
): Promise<PaymentRequirement | null> {
  try {
    const resp = await x402HttpClient.request(url, { method: "HEAD" });
    if (resp.status !== 402) {
      return null;
    }
    const parsed = await parsePaymentRequired(resp);
    return parsed?.requirement ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch a URL with automatic x402 payment.
 * If the endpoint returns 402, sign a Solana SPL transfer and retry.
 */
export async function x402Fetch(
  url: string,
  keypair: Keypair,
  method: string = "GET",
  body?: string,
  headers?: Record<string, string>,
  maxPaymentCents?: number,
): Promise<X402PaymentResult> {
  try {
    const initialResp = await x402HttpClient.request(url, {
      method,
      headers: { ...headers, "Content-Type": "application/json" },
      body,
    });

    if (initialResp.status !== 402) {
      const data = await initialResp
        .json()
        .catch(() => initialResp.text());
      return { success: initialResp.ok, response: data, status: initialResp.status };
    }

    const parsed = await parsePaymentRequired(initialResp);
    if (!parsed) {
      return {
        success: false,
        error: "Could not parse payment requirements",
        status: initialResp.status,
      };
    }

    // Check amount against maxPaymentCents BEFORE signing
    if (maxPaymentCents !== undefined) {
      const amountAtomic = parseMaxAmountRequired(
        parsed.requirement.maxAmountRequired,
        parsed.x402Version,
      );
      const amountCents = Number(amountAtomic) / 10_000;
      if (amountCents > maxPaymentCents) {
        return {
          success: false,
          error: `Payment of ${amountCents.toFixed(2)} cents exceeds max allowed ${maxPaymentCents} cents`,
          status: 402,
        };
      }
    }

    // Sign payment (Solana SPL transfer authorization)
    let payment: any;
    try {
      payment = await signPayment(
        keypair,
        parsed.requirement,
        parsed.x402Version,
      );
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to sign payment: ${err?.message || String(err)}`,
        status: initialResp.status,
      };
    }

    const paymentHeader = Buffer.from(
      JSON.stringify(payment),
    ).toString("base64");

    const paidResp = await x402HttpClient.request(url, {
      method,
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "X-Payment": paymentHeader,
      },
      body,
      retries: 0,
    });

    const data = await paidResp.json().catch(() => paidResp.text());
    return { success: paidResp.ok, response: data, status: paidResp.status };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function parsePaymentRequired(
  resp: Response,
): Promise<ParsedPaymentRequirement | null> {
  const header = resp.headers.get("X-Payment-Required");
  if (header) {
    const rawHeader = safeJsonParse(header);
    const normalizedRaw = normalizePaymentRequired(rawHeader);
    if (normalizedRaw) {
      return {
        x402Version: normalizedRaw.x402Version,
        requirement: selectRequirement(normalizedRaw),
      };
    }

    try {
      const decoded = Buffer.from(header, "base64").toString("utf-8");
      const parsedDecoded = normalizePaymentRequired(safeJsonParse(decoded));
      if (parsedDecoded) {
        return {
          x402Version: parsedDecoded.x402Version,
          requirement: selectRequirement(parsedDecoded),
        };
      }
    } catch {
      // Ignore
    }
  }

  try {
    const bodyData = await resp.json();
    const parsedBody = normalizePaymentRequired(bodyData);
    if (!parsedBody) return null;
    return {
      x402Version: parsedBody.x402Version,
      requirement: selectRequirement(parsedBody),
    };
  } catch {
    return null;
  }
}

/**
 * Sign a Solana SPL token transfer authorization for x402 payment.
 * Creates a signed transaction that can be submitted by the server.
 */
async function signPayment(
  keypair: Keypair,
  requirement: PaymentRequirement,
  x402Version: number,
): Promise<any> {
  const cluster = CLUSTERS[requirement.network];
  if (!cluster) {
    throw new Error(`Unsupported network: ${requirement.network}`);
  }

  const amount = parseMaxAmountRequired(
    requirement.maxAmountRequired,
    x402Version,
  );

  const rpcUrl = process.env.AUTOMATON_RPC_URL || clusterApiUrl(cluster as any);
  const connection = new Connection(rpcUrl, "confirmed");
  const usdcMint = new PublicKey(requirement.usdcMint);
  const payTo = new PublicKey(requirement.payToAddress);

  const senderAta = await getAssociatedTokenAddress(usdcMint, keypair.publicKey);
  const recipientAta = await getAssociatedTokenAddress(usdcMint, payTo);

  const transferIx = createTransferInstruction(
    senderAta,
    recipientAta,
    keypair.publicKey,
    BigInt(amount.toString()),
  );

  const tx = new Transaction().add(transferIx);
  tx.feePayer = keypair.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(keypair);

  const serializedTx = tx.serialize().toString("base64");

  // Sign a message proving intent
  const now = Math.floor(Date.now() / 1000);
  const intentMessage = JSON.stringify({
    from: keypair.publicKey.toBase58(),
    to: requirement.payToAddress,
    amount: amount.toString(),
    mint: requirement.usdcMint,
    timestamp: now,
  });
  const intentBytes = new TextEncoder().encode(intentMessage);
  const intentSig = bs58.encode(nacl.sign.detached(intentBytes, keypair.secretKey));

  return {
    x402Version,
    scheme: requirement.scheme,
    network: requirement.network,
    payload: {
      transaction: serializedTx,
      signature: intentSig,
      authorization: {
        from: keypair.publicKey.toBase58(),
        to: requirement.payToAddress,
        amount: amount.toString(),
        mint: requirement.usdcMint,
        timestamp: now,
      },
    },
  };
}
