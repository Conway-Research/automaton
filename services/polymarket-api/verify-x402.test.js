import { describe, it, expect, vi, beforeEach } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { verifyX402Payment, EIP712_DOMAIN, TRANSFER_WITH_AUTH_TYPES, usedNonces } from "./verify-x402.js";

// Known test private key (Hardhat account #0 -- NEVER use in production)
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ACCOUNT = privateKeyToAccount(TEST_PRIVATE_KEY);
const PAY_TO = "0xa2e4B81f2CD154A0857b280754507f369eD685ba";

async function createTestPayment(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const defaults = {
    from: TEST_ACCOUNT.address,
    to: PAY_TO,
    value: 10000n, // 1 cent in atomic units
    validAfter: BigInt(now - 60),
    validBefore: BigInt(now + 300),
    nonce: `0x${"a".repeat(64)}`,
  };
  const message = { ...defaults, ...overrides };

  const signature = await TEST_ACCOUNT.signTypedData({
    domain: EIP712_DOMAIN,
    types: TRANSFER_WITH_AUTH_TYPES,
    primaryType: "TransferWithAuthorization",
    message,
  });

  return {
    x402Version: 1,
    scheme: "exact",
    network: "eip155:8453",
    payload: {
      signature,
      authorization: {
        from: message.from,
        to: message.to,
        value: message.value.toString(),
        validAfter: message.validAfter.toString(),
        validBefore: message.validBefore.toString(),
        nonce: message.nonce,
      },
    },
  };
}

function encodePayment(payment) {
  return Buffer.from(JSON.stringify(payment)).toString("base64");
}

describe("verifyX402Payment", () => {
  const baseOpts = { payToAddress: PAY_TO, minAmountCents: 1 };

  beforeEach(() => {
    usedNonces.clear();
  });

  it("accepts valid payment", async () => {
    const payment = await createTestPayment();
    const result = await verifyX402Payment(encodePayment(payment), baseOpts);
    expect(result.valid).toBe(true);
    expect(result.from).toBe(TEST_ACCOUNT.address);
  });

  it("rejects expired payment (validBefore in past)", async () => {
    const payment = await createTestPayment({
      validBefore: BigInt(Math.floor(Date.now() / 1000) - 100),
    });
    const result = await verifyX402Payment(encodePayment(payment), baseOpts);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("expired");
  });

  it("rejects future payment (validAfter in future)", async () => {
    const payment = await createTestPayment({
      validAfter: BigInt(Math.floor(Date.now() / 1000) + 3600),
    });
    const result = await verifyX402Payment(encodePayment(payment), baseOpts);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not yet valid");
  });

  it("rejects wrong payee", async () => {
    const wrongPayee = "0x0000000000000000000000000000000000000001";
    const payment = await createTestPayment({ to: wrongPayee });
    // The signature was made with wrong payee, and authorization.to matches the signed message
    payment.payload.authorization.to = wrongPayee;
    const result = await verifyX402Payment(encodePayment(payment), baseOpts);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Wrong payee");
  });

  it("rejects insufficient payment amount", async () => {
    const payment = await createTestPayment({ value: 1n }); // 1 atomic unit, way below 1 cent
    const result = await verifyX402Payment(encodePayment(payment), {
      ...baseOpts,
      minAmountCents: 1,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Insufficient payment");
  });

  it("rejects non-numeric auth.value without throwing", async () => {
    const payment = await createTestPayment();
    payment.payload.authorization.value = "not-a-number";
    const result = await verifyX402Payment(encodePayment(payment), baseOpts);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid value");
  });

  it("rejects malformed base64", async () => {
    const result = await verifyX402Payment("not-valid-base64!!!", baseOpts);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Malformed");
  });

  it("rejects missing authorization.from", async () => {
    const payment = await createTestPayment();
    delete payment.payload.authorization.from;
    const result = await verifyX402Payment(encodePayment(payment), baseOpts);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Malformed");
  });

  it("rejects tampered signature (wrong signer)", async () => {
    // Create a valid payment, then change the from address to someone else
    const payment = await createTestPayment();
    // Tamper: claim it's from a different address
    payment.payload.authorization.from = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    const result = await verifyX402Payment(encodePayment(payment), baseOpts);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid signature");
  });

  it("rejects missing signature field", async () => {
    const payment = await createTestPayment();
    delete payment.payload.signature;
    const result = await verifyX402Payment(encodePayment(payment), baseOpts);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("missing signature");
  });

  it("reports balance check failure on unreachable RPC", async () => {
    const payment = await createTestPayment();
    const result = await verifyX402Payment(encodePayment(payment), {
      ...baseOpts,
      rpcUrl: "http://127.0.0.1:1", // unreachable port
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Balance check failed");
  });

  it("rejects same nonce on second use (replay protection)", async () => {
    const payment = await createTestPayment();
    const encoded = encodePayment(payment);
    const r1 = await verifyX402Payment(encoded, baseOpts);
    const r2 = await verifyX402Payment(encoded, baseOpts);
    expect(r1.valid).toBe(true);
    expect(r2.valid).toBe(false);
    expect(r2.error).toContain("replay");
  });
});
