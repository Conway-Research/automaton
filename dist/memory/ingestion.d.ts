/**
 * Memory Ingestion Pipeline
 *
 * Post-turn pipeline that automatically extracts and stores memories.
 * Classifies turns, generates summaries, extracts facts,
 * updates relationships, and manages working memory.
 *
 * All operations are wrapped in try/catch: ingestion failures
 * must never block the agent loop.
 */
import type BetterSqlite3 from "better-sqlite3";
import type { AgentTurn, ToolCallResult } from "../types.js";
type Database = BetterSqlite3.Database;
export declare class MemoryIngestionPipeline {
    private db;
    private working;
    private episodic;
    private semantic;
    private relationships;
    constructor(db: Database);
    /**
     * Ingest a completed turn into the memory system.
     * Never throws -- all errors are caught and logged.
     */
    ingest(sessionId: string, turn: AgentTurn, toolCallResults: ToolCallResult[]): void;
    private recordEpisodic;
    private generateTurnSummary;
    private extractSemanticFacts;
    private updateRelationships;
    private updateWorkingMemory;
}
export {};
//# sourceMappingURL=ingestion.d.ts.map