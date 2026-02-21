/**
 * Session P&L Tracking + Kill Switch
 *
 * Tracks cumulative paper-trading P&L in the KV store and enforces
 * a hard stop when drawdown exceeds the configured threshold.
 *
 * Constants:
 *   Starting virtual balance : $1,000 USDC
 *   Max drawdown threshold   : -5%  = -$50  = -5,000 cents
 *   Halt duration            :  12 hours
 *
 * The kill switch is enforced deterministically in loop.ts BEFORE
 * any inference call — it is not an LLM suggestion.
 */

import type { AutomatonDatabase } from "../types.js";
import {
  KV_SESSION_PNL as KV_SESSION_PNL_KEY,
  KV_KILL_SWITCH_UNTIL as KV_KILL_SWITCH_UNTIL_KEY,
  KV_KILL_SWITCH_REASON as KV_KILL_SWITCH_REASON_KEY,
} from "../state/kv-keys.js";

// ─── Constants ─────────────────────────────────────────────────

/** Virtual paper-trading starting balance. */
export const SESSION_START_BALANCE_USDC  = 1_000;
export const SESSION_START_BALANCE_CENTS = SESSION_START_BALANCE_USDC * 100; // 100_000

/** Kill switch fires when cumulative P&L drops below this (negative). */
export const MAX_DRAWDOWN_PCT   = 5;
export const MAX_DRAWDOWN_CENTS = -Math.round(
  SESSION_START_BALANCE_CENTS * (MAX_DRAWDOWN_PCT / 100),
); // -5_000  (−$50)

/** How long trading is halted after the kill switch fires. */
export const KILL_SWITCH_DURATION_MS = 12 * 60 * 60 * 1_000; // 12 h

// ─── KV Store Keys ─────────────────────────────────────────────
// These are the single source of truth — loop.ts reads directly
// from KV so it has no import dependency on this module.

export const KV_SESSION_PNL = KV_SESSION_PNL_KEY;
export const KV_KILL_SWITCH_UNTIL = KV_KILL_SWITCH_UNTIL_KEY;
export const KV_KILL_SWITCH_REASON = KV_KILL_SWITCH_REASON_KEY;

// ─── Session P&L ───────────────────────────────────────────────

/** Read current session P&L in cents (negative = loss). */
export function getSessionPnlCents(db: AutomatonDatabase): number {
  return parseInt(db.getKV(KV_SESSION_PNL) ?? "0", 10);
}

/**
 * Add a delta to session P&L and persist.
 * Returns the new cumulative total.
 * Automatically checks and fires the kill switch if threshold breached.
 */
export function addSessionPnl(
  db: AutomatonDatabase,
  deltaCents: number,
): { newTotalCents: number; killSwitchFired: boolean; killSwitchUntil?: string } {
  const current = getSessionPnlCents(db);
  const newTotal = current + deltaCents;
  db.setKV(KV_SESSION_PNL, String(newTotal));

  const fired = checkAndTriggerKillSwitch(db, newTotal);
  return {
    newTotalCents: newTotal,
    killSwitchFired: fired !== undefined,
    killSwitchUntil: fired,
  };
}

/** Reset session P&L to zero (new session). Clears kill switch too. */
export function resetSessionPnl(db: AutomatonDatabase): void {
  db.setKV(KV_SESSION_PNL, "0");
  db.deleteKV(KV_KILL_SWITCH_UNTIL);
  db.deleteKV(KV_KILL_SWITCH_REASON);
}

// ─── Drawdown ──────────────────────────────────────────────────

/**
 * Drawdown as a positive percentage (0–100).
 * Returns 0 if session is flat or profitable.
 */
export function computeDrawdownPct(sessionPnlCents: number): number {
  if (sessionPnlCents >= 0) return 0;
  return (Math.abs(sessionPnlCents) / SESSION_START_BALANCE_CENTS) * 100;
}

// ─── Kill Switch ───────────────────────────────────────────────

export interface KillSwitchStatus {
  active: boolean;
  until?: string;
  reason?: string;
  remainingMs?: number;
}

/** Read the current kill switch state from KV. */
export function getKillSwitchStatus(db: AutomatonDatabase): KillSwitchStatus {
  const until = db.getKV(KV_KILL_SWITCH_UNTIL);
  if (!until) return { active: false };

  const untilDate = new Date(until);
  if (untilDate <= new Date()) {
    // Expired — caller should clean up
    return { active: false };
  }

  return {
    active: true,
    until,
    reason: db.getKV(KV_KILL_SWITCH_REASON) ?? "max drawdown breached",
    remainingMs: untilDate.getTime() - Date.now(),
  };
}

/**
 * Arm the kill switch for KILL_SWITCH_DURATION_MS.
 * No-op (and returns existing `until`) if already active.
 */
export function triggerKillSwitch(
  db: AutomatonDatabase,
  reason: string,
): string {
  const existing = getKillSwitchStatus(db);
  if (existing.active && existing.until) return existing.until;

  const until = new Date(Date.now() + KILL_SWITCH_DURATION_MS).toISOString();
  db.setKV(KV_KILL_SWITCH_UNTIL, until);
  db.setKV(KV_KILL_SWITCH_REASON, reason);
  return until;
}

/**
 * Internal: called by addSessionPnl after every P&L update.
 * Returns the kill switch `until` timestamp if it just fired,
 * or undefined if the threshold has not been breached.
 */
export function checkAndTriggerKillSwitch(
  db: AutomatonDatabase,
  sessionPnlCents: number,
): string | undefined {
  // No breach — threshold is negative, P&L must be more negative
  if (sessionPnlCents > MAX_DRAWDOWN_CENTS) return undefined;

  const pct = computeDrawdownPct(sessionPnlCents).toFixed(1);
  const usd = (sessionPnlCents / 100).toFixed(2);
  const reason =
    `Cumulative P&L hit ${usd} USD (−${pct}%) — ` +
    `max −${MAX_DRAWDOWN_PCT}% of $${SESSION_START_BALANCE_USDC} reached`;

  return triggerKillSwitch(db, reason);
}

/**
 * Manually disarm the kill switch.
 * The loop reads KV directly, so deleting the key re-enables trading
 * on the next wake cycle without any restart required.
 */
export function resetKillSwitch(db: AutomatonDatabase): void {
  db.deleteKV(KV_KILL_SWITCH_UNTIL);
  db.deleteKV(KV_KILL_SWITCH_REASON);
}
