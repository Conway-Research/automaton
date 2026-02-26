/**
 * Plimsoll Transaction Guard Policy Rules
 *
 * Three defense engines ported from the Plimsoll Protocol
 * (https://github.com/scoootscooob/plimsoll-protocol) to protect
 * the automaton's wallet from prompt-injection-driven drain attacks.
 *
 * Engines:
 *   1. Trajectory Hash  — Detects hallucination retry loops by
 *      hashing (tool, target, amount) and blocking repeated identical
 *      calls within a sliding window.
 *   2. Capital Velocity  — Enforces a maximum spend-rate (USD/sec)
 *      using a sliding window, preventing both rapid drain and
 *      slow-bleed attacks that stay under per-tx limits.
 *   3. Entropy Guard     — Blocks payloads containing high-entropy
 *      strings that look like private keys, seed phrases, or base64
 *      blobs — the signature of an exfiltration attempt.
 *
 * All three engines are zero-dependency and deterministic.
 */

import { createHash } from "crypto";
import type { PolicyRule, PolicyRequest, PolicyRuleResult } from "../../types.js";

// ─── Helpers ────────────────────────────────────────────────────

function deny(rule: string, reasonCode: string, humanMessage: string): PolicyRuleResult {
  return { rule, action: "deny", reasonCode, humanMessage };
}

function quarantine(rule: string, reasonCode: string, humanMessage: string): PolicyRuleResult {
  return { rule, action: "quarantine", reasonCode, humanMessage };
}

// ─── Engine 1: Trajectory Hash (Loop Detection) ────────────────

/**
 * In-memory sliding window of recent tool-call hashes.
 * Each entry is { hash, timestampMs }.
 */
const trajectoryWindow: { hash: string; ts: number }[] = [];
const TRAJECTORY_WINDOW_MS = 60_000; // 60 seconds
const TRAJECTORY_MAX_DUPLICATES = 3;

/**
 * Compute a canonical hash of (toolName, target, amount) so that
 * semantically identical calls produce the same digest regardless
 * of parameter ordering or whitespace.
 */
function trajectoryHash(toolName: string, args: Record<string, unknown>): string {
  const target = String(args.to_address ?? args.agent_address ?? args.url ?? args.to ?? "");
  const amount = String(args.amount_cents ?? args.amount ?? args.value ?? "0");
  const canonical = `${toolName}:${target}:${amount}`;
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

/**
 * Detect hallucination retry loops.
 *
 * If the agent issues 3+ semantically identical financial calls
 * within 60 seconds, it is likely stuck in a prompt-injection
 * loop. Block the call and tell the agent to pivot strategy.
 */
function createTrajectoryHashRule(): PolicyRule {
  return {
    id: "plimsoll.trajectory_hash",
    description: "Detect hallucination retry loops via trajectory hashing",
    priority: 450,
    appliesTo: {
      by: "name",
      names: ["transfer_credits", "x402_fetch", "fund_child"],
    },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      const now = Date.now();
      const hash = trajectoryHash(request.tool.name, request.args);

      // Prune expired entries
      while (trajectoryWindow.length > 0 && now - trajectoryWindow[0].ts > TRAJECTORY_WINDOW_MS) {
        trajectoryWindow.shift();
      }

      // Count duplicates of this hash in the window
      const dupeCount = trajectoryWindow.filter((e) => e.hash === hash).length;

      // Record this call
      trajectoryWindow.push({ hash, ts: now });

      if (dupeCount >= TRAJECTORY_MAX_DUPLICATES) {
        return deny(
          "plimsoll.trajectory_hash",
          "PLIMSOLL_LOOP_DETECTED",
          `Blocked: ${dupeCount + 1} identical ${request.tool.name} calls in ${TRAJECTORY_WINDOW_MS / 1000}s. ` +
            `This looks like a hallucination retry loop. Pivot strategy instead of retrying.`,
        );
      }

      if (dupeCount === TRAJECTORY_MAX_DUPLICATES - 1) {
        return quarantine(
          "plimsoll.trajectory_hash",
          "PLIMSOLL_LOOP_WARNING",
          `Warning: ${dupeCount + 1} identical ${request.tool.name} calls detected. ` +
            `One more retry will trigger a hard block. Consider a different approach.`,
        );
      }

      return null;
    },
  };
}

// ─── Engine 2: Capital Velocity (Spend-Rate Limiter) ───────────

/**
 * In-memory spend log for velocity calculation.
 * Each entry is { amountCents, timestampMs }.
 */
const velocityWindow: { amount: number; ts: number }[] = [];
const VELOCITY_WINDOW_MS = 300_000; // 5-minute sliding window
const VELOCITY_MAX_CENTS_PER_WINDOW = 50_000; // $500 per 5 minutes

/**
 * Enforce a maximum capital velocity (spend rate) across all
 * financial tools. Even if individual transfers are under the
 * per-tx limit, a rapid sequence of them (e.g., 100 x $4.99)
 * will trip this guard.
 *
 * This catches slow-bleed attacks that the existing per-tx and
 * hourly caps miss when the attacker spaces calls just under
 * each individual threshold.
 */
function createCapitalVelocityRule(): PolicyRule {
  return {
    id: "plimsoll.capital_velocity",
    description: "Enforce maximum capital velocity (spend rate) across financial tools",
    priority: 450,
    appliesTo: {
      by: "name",
      names: ["transfer_credits", "x402_fetch", "fund_child"],
    },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      const now = Date.now();
      const amount = (request.args.amount_cents as number | undefined) ?? 0;
      if (amount <= 0) return null;

      // Prune expired entries
      while (velocityWindow.length > 0 && now - velocityWindow[0].ts > VELOCITY_WINDOW_MS) {
        velocityWindow.shift();
      }

      // Sum current window spend
      const windowSpend = velocityWindow.reduce((sum, e) => sum + e.amount, 0);

      if (windowSpend + amount > VELOCITY_MAX_CENTS_PER_WINDOW) {
        const windowSpendDollars = (windowSpend / 100).toFixed(2);
        const maxDollars = (VELOCITY_MAX_CENTS_PER_WINDOW / 100).toFixed(2);
        return deny(
          "plimsoll.capital_velocity",
          "PLIMSOLL_VELOCITY_BREACH",
          `Blocked: spend velocity exceeded. $${windowSpendDollars} spent in the last ` +
            `${VELOCITY_WINDOW_MS / 1000}s, adding $${(amount / 100).toFixed(2)} would exceed ` +
            `the $${maxDollars} velocity cap. Wait for the window to cool down.`,
        );
      }

      // Record this spend (even if we allow — it counts toward the window)
      velocityWindow.push({ amount, ts: now });

      // Warn at 80% capacity
      const utilizationPct = ((windowSpend + amount) / VELOCITY_MAX_CENTS_PER_WINDOW) * 100;
      if (utilizationPct >= 80) {
        return quarantine(
          "plimsoll.capital_velocity",
          "PLIMSOLL_VELOCITY_WARNING",
          `Velocity at ${utilizationPct.toFixed(0)}% of cap ($${((windowSpend + amount) / 100).toFixed(2)} / $${(VELOCITY_MAX_CENTS_PER_WINDOW / 100).toFixed(2)} in ${VELOCITY_WINDOW_MS / 1000}s). ` +
            `Slow down to avoid a hard block.`,
        );
      }

      return null;
    },
  };
}

// ─── Engine 3: Entropy Guard (Exfiltration Detection) ──────────

/** Ethereum private key pattern */
const ETH_KEY_RE = /0x[0-9a-fA-F]{64}/;

/** BIP-39 mnemonic fragment (12+ lowercase words) */
const MNEMONIC_RE = /\b([a-z]{3,8}\s+){11,}[a-z]{3,8}\b/;

/** Base64 blob (40+ chars, indicative of encoded secrets) */
const BASE64_RE = /[A-Za-z0-9+/]{40,}={0,2}/;

/**
 * Compute Shannon entropy of a string.
 * High entropy (> 4.5 bits/char) in a payload field is a strong
 * signal that it contains a cryptographic secret.
 */
function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const c of s) {
    freq.set(c, (freq.get(c) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Detect private key exfiltration attempts.
 *
 * If any string field in the tool arguments contains a pattern
 * that looks like a private key, mnemonic phrase, or high-entropy
 * blob, block the call. This prevents prompt-injection attacks
 * that trick the agent into POSTing its wallet key to an
 * attacker-controlled endpoint.
 */
function createEntropyGuardRule(): PolicyRule {
  return {
    id: "plimsoll.entropy_guard",
    description: "Block payloads containing private keys, mnemonics, or high-entropy secrets",
    priority: 450,
    appliesTo: {
      by: "name",
      names: [
        "exec",
        "x402_fetch",
        "transfer_credits",
        "send_message",
        "write_file",
        "fund_child",
      ],
    },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      const strFields = extractStringFields(request.args);

      for (const { key, value } of strFields) {
        // Skip short strings — not enough data for a secret
        if (value.length < 20) continue;

        // Pattern checks
        if (ETH_KEY_RE.test(value)) {
          return deny(
            "plimsoll.entropy_guard",
            "PLIMSOLL_KEY_EXFIL",
            `Blocked: field "${key}" contains what looks like an Ethereum private key. ` +
              `This is a potential exfiltration attempt. Never include raw private keys in tool arguments.`,
          );
        }

        if (MNEMONIC_RE.test(value)) {
          return deny(
            "plimsoll.entropy_guard",
            "PLIMSOLL_MNEMONIC_EXFIL",
            `Blocked: field "${key}" contains what looks like a BIP-39 mnemonic phrase. ` +
              `Seed phrases must never be transmitted via tool calls.`,
          );
        }

        if (BASE64_RE.test(value) && shannonEntropy(value) > 5.0) {
          return deny(
            "plimsoll.entropy_guard",
            "PLIMSOLL_ENTROPY_ANOMALY",
            `Blocked: field "${key}" contains a high-entropy blob (${shannonEntropy(value).toFixed(1)} bits/char). ` +
              `This may be an encoded secret. Review the payload before retrying.`,
          );
        }
      }

      return null;
    },
  };
}

/**
 * Recursively extract all string-valued fields from an args object.
 */
function extractStringFields(
  obj: Record<string, unknown>,
  prefix = "",
): { key: string; value: string }[] {
  const results: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      results.push({ key: fullKey, value: v });
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      results.push(...extractStringFields(v as Record<string, unknown>, fullKey));
    }
  }
  return results;
}

// ─── Export ─────────────────────────────────────────────────────

/**
 * Create all Plimsoll transaction guard rules.
 *
 * Priority 450 places these between path-protection (200) and
 * financial (500) rules — they run after basic validation but
 * before per-tx spend limits, catching attack patterns that
 * individual spend limits miss.
 */
export function createPlimsollGuardRules(): PolicyRule[] {
  return [
    createTrajectoryHashRule(),
    createCapitalVelocityRule(),
    createEntropyGuardRule(),
  ];
}
