const express = require("express");
const cors = require("cors");
const { verifyX402Payment, USDC_ADDRESS } = require("./verify-x402.js");

const app = express();
app.use(cors());
app.use(express.json());

const PAY_TO_ADDRESS = process.env.PAY_TO_ADDRESS || "0xa2e4B81f2CD154A0857b280754507f369eD685ba";
const BASE_RPC_URL = process.env.BASE_RPC_URL || "";
const PRICE_CENTS = parseInt(process.env.PRICE_CENTS || "1", 10);
const PORT = parseInt(process.env.PORT || "8081", 10);

// Payment requirement response (x402 spec)
function paymentRequiredResponse(res) {
  return res.status(402).json({
    x402Version: 2,
    error: "Payment required",
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        maxAmountRequired: String(PRICE_CENTS * 10000), // cents -> atomic units
        payToAddress: PAY_TO_ADDRESS,
        requiredDeadlineSeconds: 300,
        usdcAddress: USDC_ADDRESS,
      },
    ],
  });
}

// x402 payment middleware
async function requirePayment(req, res, next) {
  const paymentHeader = req.headers["x-payment"];
  if (!paymentHeader) {
    return paymentRequiredResponse(res);
  }

  const result = await verifyX402Payment(paymentHeader, {
    payToAddress: PAY_TO_ADDRESS,
    minAmountCents: PRICE_CENTS,
    rpcUrl: BASE_RPC_URL || undefined,
  });

  if (!result.valid) {
    return res.status(402).json({
      x402Version: 2,
      error: result.error,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          maxAmountRequired: String(PRICE_CENTS * 10000),
          payToAddress: PAY_TO_ADDRESS,
          requiredDeadlineSeconds: 300,
          usdcAddress: USDC_ADDRESS,
        },
      ],
    });
  }

  req.payer = result.from;
  next();
}

// -- Routes --

// Health (ungated)
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Free tier (ungated)
app.get("/v1/free-markets", (req, res) => {
  res.json({
    markets: [
      { id: "demo-1", question: "Demo market (free tier)", outcome: "Yes/No" },
    ],
  });
});

// Paid tier (gated)
app.get("/v1/markets", requirePayment, (req, res) => {
  res.json({
    payer: req.payer,
    markets: [
      { id: "pm-1", question: "Will BTC exceed $100k by end of Q1 2026?", probability: 0.72 },
      { id: "pm-2", question: "Will ETH merge to PoS?", probability: 0.95 },
    ],
  });
});

// Only start listening if run directly (not imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Polymarket API listening on port ${PORT}`);
  });
}

module.exports = app;
