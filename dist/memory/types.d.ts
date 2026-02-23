/**
 * Memory System Types
 *
 * Re-exports memory types from types.ts and adds internal types
 * used by the memory subsystem.
 */
export type { WorkingMemoryType, WorkingMemoryEntry, TurnClassification, EpisodicMemoryEntry, SemanticCategory, SemanticMemoryEntry, ProceduralStep, ProceduralMemoryEntry, RelationshipMemoryEntry, SessionSummaryEntry, MemoryRetrievalResult, MemoryBudget, } from "../types.js";
export { DEFAULT_MEMORY_BUDGET } from "../types.js";
import type { TurnClassification, ToolCallResult } from "../types.js";
export interface TurnClassificationRule {
    pattern: (toolCalls: ToolCallResult[], thinking: string) => boolean;
    classification: TurnClassification;
}
export interface MemoryIngestionConfig {
    maxWorkingMemoryEntries: number;
    episodicRetentionDays: number;
    semanticMaxEntries: number;
    enableAutoIngestion: boolean;
}
export declare const DEFAULT_INGESTION_CONFIG: MemoryIngestionConfig;
/**
 * Classify a turn based on its tool calls and thinking content.
 * Rule-based, no inference required.
 */
export declare function classifyTurn(toolCalls: ToolCallResult[], thinking: string): TurnClassification;
//# sourceMappingURL=types.d.ts.map