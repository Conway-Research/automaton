/**
 * x402 Payment Protocol
 *
 * Enables the automaton to make USDC micropayments via HTTP 402.
 * Adapted from conway-mcp/src/x402/index.ts
 */

import {
  createPublicClient,
  http,
  parseUnits,
  type Address,
  type PrivateKeyAccount,
} from "viem";
import { base, baseSepolia } from "viem/chains";

// USDC contract addresses
const USDC_ADDRESSES: Record<string, Address> = {
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
};

const CHAINS: Record<string, any> = {
  "eip155:8453": base,
  "eip155:84532": baseSepolia,
};
type NetworkId = keyof typeof USDC_ADDRESSES;

const BALANCE_OF_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export interface PaymentRequirement {
  scheme: string;
  network: NetworkId;
  maxAmountRequired: string;
  payToAddress: Address;
  requiredDeadlineSeconds: number;
  usdcAddress: Address;
}

interface PaymentRequiredResponse {
  x402Version: number;
  accepts: PaymentRequirement[];
}

interface ParsedPaymentRequirement {
  x402Version: number;
  requirement: PaymentRequirement;
}

export interface X402PaymentResult {
  success: boolean;
  response?: any;
  error?: string;
  status?: number;
  paymentDetails?: {
    requirement: PaymentRequirement;
    x402Version: number;
  };
}

export interface UsdcBalanceResult {
  balance: number;
  network: string;
  ok: boolean;
  error?: string;
}

export interface PaymentContext {
  url: string;
  method: string;
  requirement: PaymentRequirement;
  x402Version: number;
  signerAddress: string;
}

export type PaymentMiddleware = (
  ctx: PaymentContext,
) => Promise<{ proceed: true } | { proceed: false; reason: string }>;

export interface X402FetchOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  middleware?: PaymentMiddleware[];
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
  if (normalized === "base") return "eip155:8453";
  if (normalized === "base-sepolia") return "eip155:84532";
  if (normalized === "eip155:8453" || normalized === "eip155:84532") {
    return normalized;
  }
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
    : typeof value.maxAmountRequired === "number" &&
        Number.isFinite(value.maxAmountRequired)
      ? String(value.maxAmountRequired)
      : null;
  const payToAddress = typeof value.payToAddress === "string"
    ? value.payToAddress
    : typeof value.payTo === "string"
      ? value.payTo
      : null;
  const usdcAddress = typeof value.usdcAddress === "string"
    ? value.usdcAddress
    : typeof value.asset === "string"
      ? value.asset
      : USDC_ADDRESSES[network];
  const requiredDeadlineSeconds =
    parsePositiveInt(value.requiredDeadlineSeconds) ??
    parsePositiveInt(value.maxTimeoutSeconds) ??
    300;

  if (!scheme || !maxAmountRequired || !payToAddress || !usdcAddress) {
    return null;
  }

  return {
    scheme,
    network,
    maxAmountRequired,
    payToAddress: payToAddress as Address,
    requiredDeadlineSeconds,
    usdcAddress: usdcAddress as Address,
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
    return parseUnits(amount, 6);
  }
  if (x402Version >= 2 || amount.length > 6) {
    return BigInt(amount);
  }
  return parseUnits(amount, 6);
}

function selectRequirement(parsed: PaymentRequiredResponse): PaymentRequirement {
  const exactSupported = parsed.accepts.find(
    (r) => r.scheme === "exact" && !!CHAINS[r.network],
  );
  if (exactSupported) return exactSupported;
  return parsed.accepts[0];
}

/**
 * Get the USDC balance for the automaton's wallet on a given network.
 */
export async function getUsdcBalance(
  address: Address,
  network: string = "eip155:8453",
): Promise<number> {
  const result = await getUsdcBalanceDetailed(address, network);
  return result.balance;
}

/**
 * Get the USDC balance and read status details for diagnostics.
 */
export async function getUsdcBalanceDetailed(
  address: Address,
  network: string = "eip155:8453",
): Promise<UsdcBalanceResult> {
  const chain = CHAINS[network];
  const usdcAddress = USDC_ADDRESSES[network];
  if (!chain || !usdcAddress) {
    return {
      balance: 0,
      network,
      ok: false,
      error: `Unsupported USDC network: ${network}`,
    };
  }

  try {
    const client = createPublicClient({
      chain,
      transport: http(),
    });

    const balance = await client.readContract({
      address: usdcAddress,
      abi: BALANCE_OF_ABI,
      functionName: "balanceOf",
      args: [address],
    });

    // USDC has 6 decimals
    return {
      balance: Number(balance) / 1_000_000,
      network,
      ok: true,
    };
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
    const resp = await fetch(url, { method: "GET" });
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
 * Fetch a URL with x402 payment support and middleware pipeline.
 * If the endpoint returns 402, runs middleware before signing.
 * Accepts either positional args (backward compat) or an options object.
 */
export async function x402Fetch(
  url: string,
  account: PrivateKeyAccount,
  optionsOrMethod?: X402FetchOptions | string,
  body?: string,
  headers?: Record<string, string>,
): Promise<X402PaymentResult> {
  // Backward compat: positional args → options object
  const options: X402FetchOptions =
    typeof optionsOrMethod === "object" && optionsOrMethod !== null
      ? optionsOrMethod
      : {
          method: (optionsOrMethod as string) || "GET",
          body,
          headers,
        };

  const method = options.method || "GET";

  try {
    // Initial request
    const initialResp = await fetch(url, {
      method,
      headers: { ...options.headers, "Content-Type": "application/json" },
      body: options.body,
    });

    if (initialResp.status !== 402) {
      const data = await initialResp
        .json()
        .catch(() => initialResp.text());
      return { success: initialResp.ok, response: data, status: initialResp.status };
    }

    // Parse payment requirements
    const parsed = await parsePaymentRequired(initialResp);
    if (!parsed) {
      return {
        success: false,
        error: "Could not parse payment requirements",
        status: initialResp.status,
      };
    }

    const paymentDetails = {
      requirement: parsed.requirement,
      x402Version: parsed.x402Version,
    };

    // Run middleware pipeline
    if (options.middleware && options.middleware.length > 0) {
      const ctx: PaymentContext = {
        url,
        method,
        requirement: parsed.requirement,
        x402Version: parsed.x402Version,
        signerAddress: account.address,
      };

      for (const mw of options.middleware) {
        const result = await mw(ctx);
        if (!result.proceed) {
          return {
            success: false,
            error: result.reason,
            status: 402,
            paymentDetails,
          };
        }
      }
    }

    // Sign payment
    let payment: any;
    try {
      payment = await signPayment(
        account,
        parsed.requirement,
        parsed.x402Version,
      );
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to sign payment: ${err?.message || String(err)}`,
        status: initialResp.status,
        paymentDetails,
      };
    }

    // Retry with payment
    const paymentHeader = Buffer.from(
      JSON.stringify(payment),
    ).toString("base64");

    const paidResp = await fetch(url, {
      method,
      headers: {
        ...options.headers,
        "Content-Type": "application/json",
        "X-Payment": paymentHeader,
      },
      body: options.body,
    });

    const data = await paidResp.json().catch(() => paidResp.text());
    return { success: paidResp.ok, response: data, status: paidResp.status, paymentDetails };
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
      // Ignore header decode errors and continue with body parsing.
    }
  }

  try {
    const body = await resp.json();
    const parsedBody = normalizePaymentRequired(body);
    if (!parsedBody) return null;
    return {
      x402Version: parsedBody.x402Version,
      requirement: selectRequirement(parsedBody),
    };
  } catch {
    return null;
  }
}

async function signPayment(
  account: PrivateKeyAccount,
  requirement: PaymentRequirement,
  x402Version: number,
): Promise<any> {
  const chain = CHAINS[requirement.network];
  if (!chain) {
    throw new Error(`Unsupported network: ${requirement.network}`);
  }

  const nonce = `0x${Buffer.from(
    crypto.getRandomValues(new Uint8Array(32)),
  ).toString("hex")}`;

  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 60;
  const validBefore = now + requirement.requiredDeadlineSeconds;
  const amount = parseMaxAmountRequired(
    requirement.maxAmountRequired,
    x402Version,
  );

  // EIP-712 typed data for TransferWithAuthorization
  const domain = {
    name: "USD Coin",
    version: "2",
    chainId: chain.id,
    verifyingContract: requirement.usdcAddress,
  } as const;

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  } as const;

  const message = {
    from: account.address,
    to: requirement.payToAddress,
    value: amount,
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce: nonce as `0x${string}`,
  };

  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: "TransferWithAuthorization",
    message,
  });

  return {
    x402Version,
    scheme: requirement.scheme,
    network: requirement.network,
    payload: {
      signature,
      authorization: {
        from: account.address,
        to: requirement.payToAddress,
        value: amount.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  };
}
