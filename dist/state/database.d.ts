/**
 * Automaton Database
 *
 * SQLite-backed persistent state for the automaton.
 * Uses better-sqlite3 for synchronous, single-process access.
 */
import type BetterSqlite3 from "better-sqlite3";
type DatabaseType = BetterSqlite3.Database;
import type { AutomatonDatabase } from "../types.js";
import type { RiskLevel, PolicyAction, SpendCategory, HeartbeatScheduleRow, HeartbeatHistoryRow, WakeEventRow, SoulHistoryRow, InferenceCostRow, ModelRegistryRow, WorkingMemoryEntry, EpisodicMemoryEntry, SessionSummaryEntry, SemanticMemoryEntry, SemanticCategory, ProceduralMemoryEntry, RelationshipMemoryEntry, ChildLifecycleEventRow, ChildLifecycleState, OnchainTransactionRow, DiscoveredAgentCacheRow, MetricSnapshotRow } from "../types.js";
export declare function createDatabase(dbPath: string): AutomatonDatabase;
export declare function withTransaction<T>(db: DatabaseType, fn: () => T): T;
export declare function checkpointWAL(db: DatabaseType): void;
export interface PolicyDecisionRow {
    id: string;
    turnId: string | null;
    toolName: string;
    toolArgsHash: string;
    riskLevel: RiskLevel;
    decision: PolicyAction;
    rulesEvaluated: string;
    rulesTriggered: string;
    reason: string;
    latencyMs: number;
}
export interface SpendTrackingRow {
    id: string;
    toolName: string;
    amountCents: number;
    recipient: string | null;
    domain: string | null;
    category: SpendCategory;
    windowHour: string;
    windowDay: string;
}
export declare function insertPolicyDecision(db: DatabaseType, row: PolicyDecisionRow): void;
export declare function getPolicyDecisions(db: DatabaseType, filters: {
    turnId?: string;
    toolName?: string;
    decision?: PolicyAction;
}): PolicyDecisionRow[];
export declare function insertSpendRecord(db: DatabaseType, entry: SpendTrackingRow): void;
export declare function getSpendByWindow(db: DatabaseType, category: string, windowType: "hour" | "day", window: string): number;
export declare function pruneSpendRecords(db: DatabaseType, olderThan: string): number;
export declare function getHeartbeatSchedule(db: DatabaseType): HeartbeatScheduleRow[];
export declare function getHeartbeatTask(db: DatabaseType, taskName: string): HeartbeatScheduleRow | undefined;
export declare function updateHeartbeatSchedule(db: DatabaseType, taskName: string, updates: Partial<HeartbeatScheduleRow>): void;
export declare function upsertHeartbeatSchedule(db: DatabaseType, row: HeartbeatScheduleRow): void;
export declare function insertHeartbeatHistory(db: DatabaseType, entry: HeartbeatHistoryRow): void;
export declare function getHeartbeatHistory(db: DatabaseType, taskName: string, limit?: number): HeartbeatHistoryRow[];
export declare function acquireTaskLease(db: DatabaseType, taskName: string, owner: string, ttlMs: number): boolean;
export declare function releaseTaskLease(db: DatabaseType, taskName: string, owner: string): void;
export declare function clearExpiredLeases(db: DatabaseType): number;
export declare function insertWakeEvent(db: DatabaseType, source: string, reason: string, payload?: object): void;
export declare function consumeNextWakeEvent(db: DatabaseType): WakeEventRow | undefined;
export declare function getUnconsumedWakeEvents(db: DatabaseType): WakeEventRow[];
export declare function pruneStaleKV(db: DatabaseType, prefix: string, retentionDays: number): number;
export declare function insertDedupKey(db: DatabaseType, key: string, taskName: string, ttlMs: number): boolean;
export declare function pruneExpiredDedupKeys(db: DatabaseType): number;
export declare function isDeduplicated(db: DatabaseType, key: string): boolean;
export declare function claimInboxMessages(db: DatabaseType, limit: number): InboxMessageRow[];
export declare function markInboxProcessed(db: DatabaseType, ids: string[]): void;
export declare function markInboxFailed(db: DatabaseType, ids: string[]): void;
export declare function resetInboxToReceived(db: DatabaseType, ids: string[]): void;
export declare function getUnprocessedInboxCount(db: DatabaseType): number;
export interface InboxMessageRow {
    id: string;
    fromAddress: string;
    content: string;
    receivedAt: string;
    processedAt: string | null;
    replyTo: string | null;
    toAddress: string | null;
    rawContent: string | null;
    status: string;
    retryCount: number;
    maxRetries: number;
}
export declare function insertSoulHistory(db: DatabaseType, row: SoulHistoryRow): void;
export declare function getSoulHistory(db: DatabaseType, limit?: number): SoulHistoryRow[];
export declare function getSoulVersion(db: DatabaseType, version: number): SoulHistoryRow | undefined;
export declare function getCurrentSoulVersion(db: DatabaseType): number;
export declare function getLatestSoulHistory(db: DatabaseType): SoulHistoryRow | undefined;
export declare function wmInsert(db: DatabaseType, entry: Omit<WorkingMemoryEntry, "id" | "createdAt">): string;
export declare function wmGetBySession(db: DatabaseType, sessionId: string): WorkingMemoryEntry[];
export declare function wmUpdate(db: DatabaseType, id: string, updates: Partial<WorkingMemoryEntry>): void;
export declare function wmDelete(db: DatabaseType, id: string): void;
export declare function wmPrune(db: DatabaseType, sessionId: string, maxEntries: number): number;
export declare function wmClearExpired(db: DatabaseType): number;
export declare function episodicInsert(db: DatabaseType, entry: Omit<EpisodicMemoryEntry, "id" | "createdAt" | "accessedCount" | "lastAccessedAt">): string;
export declare function episodicGetRecent(db: DatabaseType, sessionId: string, limit?: number): EpisodicMemoryEntry[];
export declare function episodicSearch(db: DatabaseType, query: string, limit?: number): EpisodicMemoryEntry[];
export declare function episodicMarkAccessed(db: DatabaseType, id: string): void;
export declare function episodicPrune(db: DatabaseType, retentionDays: number): number;
export declare function sessionSummaryInsert(db: DatabaseType, entry: Omit<SessionSummaryEntry, "id" | "createdAt">): string;
export declare function sessionSummaryGet(db: DatabaseType, sessionId: string): SessionSummaryEntry | undefined;
export declare function sessionSummaryGetRecent(db: DatabaseType, limit?: number): SessionSummaryEntry[];
export declare function semanticUpsert(db: DatabaseType, entry: Omit<SemanticMemoryEntry, "id" | "createdAt" | "updatedAt">): string;
export declare function semanticGet(db: DatabaseType, category: SemanticCategory, key: string): SemanticMemoryEntry | undefined;
export declare function semanticSearch(db: DatabaseType, query: string, category?: SemanticCategory): SemanticMemoryEntry[];
export declare function semanticGetByCategory(db: DatabaseType, category: SemanticCategory): SemanticMemoryEntry[];
export declare function semanticDelete(db: DatabaseType, id: string): void;
export declare function semanticPrune(db: DatabaseType, maxEntries: number): number;
export declare function proceduralUpsert(db: DatabaseType, entry: Omit<ProceduralMemoryEntry, "id" | "createdAt" | "updatedAt" | "successCount" | "failureCount" | "lastUsedAt">): string;
export declare function proceduralGet(db: DatabaseType, name: string): ProceduralMemoryEntry | undefined;
export declare function proceduralRecordOutcome(db: DatabaseType, name: string, success: boolean): void;
export declare function proceduralSearch(db: DatabaseType, query: string): ProceduralMemoryEntry[];
export declare function proceduralDelete(db: DatabaseType, name: string): void;
export declare function relationshipUpsert(db: DatabaseType, entry: Omit<RelationshipMemoryEntry, "id" | "createdAt" | "updatedAt" | "interactionCount" | "lastInteractionAt">): string;
export declare function relationshipGet(db: DatabaseType, entityAddress: string): RelationshipMemoryEntry | undefined;
export declare function relationshipRecordInteraction(db: DatabaseType, entityAddress: string): void;
export declare function relationshipUpdateTrust(db: DatabaseType, entityAddress: string, trustDelta: number): void;
export declare function relationshipGetTrusted(db: DatabaseType, minTrust?: number): RelationshipMemoryEntry[];
export declare function relationshipDelete(db: DatabaseType, entityAddress: string): void;
export declare function inferenceInsertCost(db: DatabaseType, row: Omit<InferenceCostRow, "id" | "createdAt">): string;
export declare function inferenceGetSessionCosts(db: DatabaseType, sessionId: string): InferenceCostRow[];
export declare function inferenceGetDailyCost(db: DatabaseType, date?: string): number;
export declare function inferenceGetHourlyCost(db: DatabaseType): number;
export declare function inferenceGetModelCosts(db: DatabaseType, model: string, days?: number): {
    totalCents: number;
    callCount: number;
};
export declare function inferencePruneCosts(db: DatabaseType, retentionDays: number): number;
export declare function modelRegistryUpsert(db: DatabaseType, entry: ModelRegistryRow): void;
export declare function modelRegistryGet(db: DatabaseType, modelId: string): ModelRegistryRow | undefined;
export declare function modelRegistryGetAll(db: DatabaseType): ModelRegistryRow[];
export declare function modelRegistryGetAvailable(db: DatabaseType, tierMinimum?: string): ModelRegistryRow[];
export declare function modelRegistrySetEnabled(db: DatabaseType, modelId: string, enabled: boolean): void;
export declare function lifecycleInsertEvent(db: DatabaseType, row: ChildLifecycleEventRow): void;
export declare function lifecycleGetEvents(db: DatabaseType, childId: string): ChildLifecycleEventRow[];
export declare function lifecycleGetLatestState(db: DatabaseType, childId: string): ChildLifecycleState | null;
export declare function getChildrenByStatus(db: DatabaseType, status: string): any[];
export declare function updateChildStatus(db: DatabaseType, childId: string, status: string): void;
export declare function deleteChild(db: DatabaseType, childId: string): void;
export declare function agentCacheUpsert(db: DatabaseType, row: DiscoveredAgentCacheRow): void;
export declare function agentCacheGet(db: DatabaseType, agentAddress: string): DiscoveredAgentCacheRow | undefined;
export declare function agentCacheGetValid(db: DatabaseType): DiscoveredAgentCacheRow[];
export declare function agentCachePrune(db: DatabaseType): number;
export declare function onchainTxInsert(db: DatabaseType, row: OnchainTransactionRow): void;
export declare function onchainTxGetByHash(db: DatabaseType, txHash: string): OnchainTransactionRow | undefined;
export declare function onchainTxGetAll(db: DatabaseType, filter?: {
    status?: string;
}): OnchainTransactionRow[];
export declare function onchainTxUpdateStatus(db: DatabaseType, txHash: string, status: string, gasUsed?: number): void;
export declare function metricsInsertSnapshot(db: DatabaseType, row: MetricSnapshotRow): void;
export declare function metricsGetSnapshots(db: DatabaseType, since: string, limit?: number): MetricSnapshotRow[];
export declare function metricsGetLatest(db: DatabaseType): MetricSnapshotRow | undefined;
export declare function metricsPruneOld(db: DatabaseType, olderThanDays?: number): number;
export {};
//# sourceMappingURL=database.d.ts.map