/**
 * Canonical KV keys used across runtime, heartbeat, and safety guardrails.
 */

// Runtime lifecycle
export const KV_START_TIME = "start_time";
export const KV_WAKE_REQUEST = "wake_request";
export const KV_SLEEP_UNTIL = "sleep_until";
export const KV_SLEEP_REASON = "sleep_reason";

// Loop guardrails
export const KV_LAST_TOOL_NAME = "last_tool_name";
export const KV_SAME_TOOL_COUNT = "same_tool_count";

// Trading safety (kill switch + session P&L)
export const KV_SESSION_PNL = "session_pnl_cents";
export const KV_KILL_SWITCH_UNTIL = "kill_switch_until";
export const KV_KILL_SWITCH_REASON = "kill_switch_reason";

// Heartbeat + observability
export const KV_LAST_HEARTBEAT_PING = "last_heartbeat_ping";
export const KV_LAST_DISTRESS = "last_distress";
export const KV_LAST_CREDIT_CHECK = "last_credit_check";
export const KV_PREV_CREDIT_TIER = "prev_credit_tier";
export const KV_LAST_USDC_CHECK = "last_usdc_check";
export const KV_SOCIAL_INBOX_CURSOR = "social_inbox_cursor";
export const KV_UPSTREAM_STATUS = "upstream_status";
export const KV_LAST_HEALTH_CHECK = "last_health_check";

export function kvInboxSeenMessage(messageId: string): string {
  return `inbox_seen_${messageId}`;
}
