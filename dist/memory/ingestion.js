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
import { WorkingMemoryManager } from "./working.js";
import { EpisodicMemoryManager } from "./episodic.js";
import { SemanticMemoryManager } from "./semantic.js";
import { RelationshipMemoryManager } from "./relationship.js";
import { classifyTurn } from "./types.js";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("memory.ingestion");
export class MemoryIngestionPipeline {
    db;
    working;
    episodic;
    semantic;
    relationships;
    constructor(db) {
        this.db = db;
        this.working = new WorkingMemoryManager(db);
        this.episodic = new EpisodicMemoryManager(db);
        this.semantic = new SemanticMemoryManager(db);
        this.relationships = new RelationshipMemoryManager(db);
    }
    /**
     * Ingest a completed turn into the memory system.
     * Never throws -- all errors are caught and logged.
     */
    ingest(sessionId, turn, toolCallResults) {
        try {
            const classification = classifyTurn(toolCallResults, turn.thinking);
            // 1. Record episodic memory for the turn
            this.recordEpisodic(sessionId, turn, toolCallResults, classification);
            // 2. Extract semantic facts from tool results
            this.extractSemanticFacts(sessionId, turn, toolCallResults);
            // 3. Update relationship memory from inbox interactions
            this.updateRelationships(sessionId, turn, toolCallResults);
            // 4. Update working memory (goals, tasks)
            this.updateWorkingMemory(sessionId, turn, toolCallResults);
            // 5. Prune working memory if over limit
            this.working.prune(sessionId, 20);
        }
        catch (error) {
            logger.error("Ingestion failed", error instanceof Error ? error : undefined);
            // Never throw -- memory failure must not block the agent loop
        }
    }
    recordEpisodic(sessionId, turn, toolCallResults, classification) {
        try {
            const toolNames = toolCallResults.map((tc) => tc.name).join(", ");
            const hasErrors = toolCallResults.some((tc) => tc.error);
            const summary = this.generateTurnSummary(turn, toolCallResults);
            const outcome = hasErrors
                ? "failure"
                : toolCallResults.length > 0
                    ? "success"
                    : "neutral";
            // Importance based on classification
            const importanceMap = {
                strategic: 0.9,
                productive: 0.7,
                communication: 0.6,
                maintenance: 0.3,
                idle: 0.1,
                error: 0.8,
            };
            this.episodic.record({
                sessionId,
                eventType: toolCallResults.length > 0 ? `tool:${toolNames.split(",")[0]?.trim() || "unknown"}` : "thinking",
                summary,
                detail: turn.thinking.length > 200 ? turn.thinking.slice(0, 500) : null,
                outcome,
                importance: importanceMap[classification] ?? 0.5,
                classification: classification,
            });
        }
        catch (error) {
            logger.error("Episodic recording failed", error instanceof Error ? error : undefined);
        }
    }
    generateTurnSummary(turn, toolCallResults) {
        const parts = [];
        if (toolCallResults.length > 0) {
            const toolSummaries = toolCallResults.map((tc) => {
                const status = tc.error ? "FAILED" : "ok";
                return `${tc.name}(${status})`;
            });
            parts.push(`Tools: ${toolSummaries.join(", ")}`);
        }
        if (turn.thinking) {
            parts.push(turn.thinking.slice(0, 150));
        }
        return parts.join(" | ") || "No activity";
    }
    extractSemanticFacts(sessionId, turn, toolCallResults) {
        try {
            for (const tc of toolCallResults) {
                if (tc.error)
                    continue;
                // Extract facts from specific tool results
                if (tc.name === "check_credits" && tc.result) {
                    this.semantic.store({
                        category: "financial",
                        key: "last_known_balance",
                        value: tc.result,
                        confidence: 1.0,
                        source: sessionId,
                    });
                }
                if (tc.name === "system_synopsis" && tc.result) {
                    this.semantic.store({
                        category: "self",
                        key: "system_synopsis",
                        value: tc.result.slice(0, 500),
                        confidence: 1.0,
                        source: sessionId,
                    });
                }
                if (tc.name === "check_usdc_balance" && tc.result) {
                    this.semantic.store({
                        category: "financial",
                        key: "usdc_balance",
                        value: tc.result,
                        confidence: 1.0,
                        source: sessionId,
                    });
                }
                if (tc.name === "discover_agents" && tc.result && !tc.result.includes("No agents")) {
                    this.semantic.store({
                        category: "environment",
                        key: "known_agents",
                        value: tc.result.slice(0, 500),
                        confidence: 0.8,
                        source: sessionId,
                    });
                }
            }
        }
        catch (error) {
            logger.error("Semantic extraction failed", error instanceof Error ? error : undefined);
        }
    }
    updateRelationships(sessionId, turn, toolCallResults) {
        try {
            // Track outbound message interactions
            for (const tc of toolCallResults) {
                if (tc.error)
                    continue;
                if (tc.name === "send_message") {
                    const toAddress = tc.arguments.to_address;
                    if (toAddress) {
                        const existing = this.relationships.get(toAddress);
                        if (existing) {
                            this.relationships.recordInteraction(toAddress);
                        }
                        else {
                            this.relationships.record({
                                entityAddress: toAddress,
                                relationshipType: "contacted",
                                trustScore: 0.5,
                            });
                        }
                    }
                }
            }
            // Track inbox message sources (once per turn, not per tool call)
            if (turn.inputSource === "agent" && turn.input) {
                const fromMatch = turn.input.match(/\[Message from (0x[a-fA-F0-9]+)\]/);
                if (fromMatch) {
                    const fromAddress = fromMatch[1];
                    const existing = this.relationships.get(fromAddress);
                    if (existing) {
                        this.relationships.recordInteraction(fromAddress);
                    }
                    else {
                        this.relationships.record({
                            entityAddress: fromAddress,
                            relationshipType: "messaged_us",
                            trustScore: 0.5,
                        });
                    }
                }
            }
        }
        catch (error) {
            logger.error("Relationship update failed", error instanceof Error ? error : undefined);
        }
    }
    updateWorkingMemory(sessionId, turn, toolCallResults) {
        try {
            for (const tc of toolCallResults) {
                if (tc.error)
                    continue;
                // Track sleep as an observation
                if (tc.name === "sleep") {
                    this.working.add({
                        sessionId,
                        content: `Agent chose to sleep: ${(tc.result || "").slice(0, 200)}`,
                        contentType: "observation",
                        priority: 0.3,
                        sourceTurn: turn.id,
                    });
                }
                // Track strategic decisions
                if (tc.name === "edit_own_file" || tc.name === "update_genesis_prompt") {
                    this.working.add({
                        sessionId,
                        content: `Self-modification: ${tc.name} - ${(tc.result || "").slice(0, 200)}`,
                        contentType: "decision",
                        priority: 0.9,
                        sourceTurn: turn.id,
                    });
                }
            }
        }
        catch (error) {
            logger.error("Working memory update failed", error instanceof Error ? error : undefined);
        }
    }
}
//# sourceMappingURL=ingestion.js.map