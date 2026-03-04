const { verifyTypedData, createPublicClient, http } = require("viem");
const { base } = require("viem/chains");

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const EIP712_DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: 8453,
  verifyingContract: USDC_ADDRESS,
};

const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

const BALANCE_OF_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

/**
 * Verify an x402 payment from the X-Payment header.
 *
 * @param {string} headerValue - Base64-encoded JSON payment object
 * @param {object} options
 * @param {string} options.payToAddress - Expected recipient address
 * @param {number} options.minAmountCents - Minimum payment in cents (e.g., 1 = $0.01)
 * @param {string} [options.rpcUrl] - Base RPC URL for balance check
 * @returns {Promise<{ valid: boolean; error?: string; from?: string }>}
 */
async function verifyX402Payment(headerValue, options) {
  const { payToAddress, minAmountCents, rpcUrl } = options;

  // Step 1: Decode base64 -> JSON
  let payment;
  try {
    const json = Buffer.from(headerValue, "base64").toString("utf-8");
    payment = JSON.parse(json);
  } catch {
    return { valid: false, error: "Malformed payment: invalid base64 or JSON" };
  }

  // Step 2: Validate structure
  const auth = payment?.payload?.authorization;
  if (!auth || !auth.from || !auth.to || !auth.value || auth.nonce === undefined) {
    return { valid: false, error: "Malformed payment: missing authorization fields" };
  }

  const signature = payment?.payload?.signature;
  if (!signature) {
    return { valid: false, error: "Malformed payment: missing signature" };
  }

  // Step 3: Verify recipient matches
  if (auth.to.toLowerCase() !== payToAddress.toLowerCase()) {
    return { valid: false, error: `Wrong payee: expected ${payToAddress}, got ${auth.to}` };
  }

  // Step 4: Verify amount >= minimum
  const valueAtomic = BigInt(auth.value);
  const minAtomic = BigInt(minAmountCents) * 10000n; // cents -> 6-decimal atomic units
  if (valueAtomic < minAtomic) {
    return {
      valid: false,
      error: `Insufficient payment: ${valueAtomic} < ${minAtomic} atomic units`,
    };
  }

  // Step 5: Verify time window
  const now = Math.floor(Date.now() / 1000);
  if (Number(auth.validAfter) > now) {
    return { valid: false, error: "Payment not yet valid" };
  }
  if (Number(auth.validBefore) <= now) {
    return { valid: false, error: "Payment expired" };
  }

  // Step 6: Verify EIP-712 signature
  try {
    const message = {
      from: auth.from,
      to: auth.to,
      value: BigInt(auth.value),
      validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
      nonce: auth.nonce,
    };

    const recoveredAddress = await verifyTypedData({
      address: auth.from,
      domain: EIP712_DOMAIN,
      types: TRANSFER_WITH_AUTH_TYPES,
      primaryType: "TransferWithAuthorization",
      message,
      signature,
    });

    if (!recoveredAddress) {
      return { valid: false, error: "Invalid signature" };
    }
  } catch (err) {
    return { valid: false, error: `Signature verification failed: ${err.message}` };
  }

  // Step 7: Check on-chain USDC balance (optional, requires RPC)
  if (rpcUrl) {
    try {
      const client = createPublicClient({
        chain: base,
        transport: http(rpcUrl, { timeout: 10_000 }),
      });

      const balance = await client.readContract({
        address: USDC_ADDRESS,
        abi: BALANCE_OF_ABI,
        functionName: "balanceOf",
        args: [auth.from],
      });

      if (balance < valueAtomic) {
        return { valid: false, error: "Insufficient USDC balance" };
      }
    } catch (err) {
      return { valid: false, error: `Balance check failed: ${err.message}` };
    }
  }

  // TODO: nonce replay tracking (requires persistent storage)

  return { valid: true, from: auth.from };
}

module.exports = { verifyX402Payment, EIP712_DOMAIN, TRANSFER_WITH_AUTH_TYPES, BALANCE_OF_ABI, USDC_ADDRESS };
