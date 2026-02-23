/**
 * Memory Tool Implementations
 *
 * Provides the execute functions for agent-accessible memory tools.
 * Each function operates on the database directly via memory managers.
 */
import { WorkingMemoryManager } from "./working.js";
import { EpisodicMemoryManager } from "./episodic.js";
import { SemanticMemoryManager } from "./semantic.js";
import { ProceduralMemoryManager } from "./procedural.js";
import { RelationshipMemoryManager } from "./relationship.js";
/**
 * Store a semantic memory (fact).
 */
export function rememberFact(db, args) {
    try {
        const semantic = new SemanticMemoryManager(db);
        const id = semantic.store({
            category: args.category,
            key: args.key,
            value: args.value,
            confidence: args.confidence ?? 1.0,
            source: args.source ?? "agent",
        });
        return `Fact stored: [${args.category}/${args.key}] = ${args.value} (id: ${id})`;
    }
    catch (error) {
        return `Failed to store fact: ${error instanceof Error ? error.message : error}`;
    }
}
/**
 * Search semantic memory by category and/or query.
 */
export function recallFacts(db, args) {
    try {
        const semantic = new SemanticMemoryManager(db);
        if (args.query) {
            const results = semantic.search(args.query, args.category);
            if (results.length === 0)
                return "No matching facts found.";
            return results
                .map((r) => `[${r.category}/${r.key}] = ${r.value} (confidence: ${r.confidence})`)
                .join("\n");
        }
        if (args.category) {
            const results = semantic.getByCategory(args.category);
            if (results.length === 0)
                return `No facts in category: ${args.category}`;
            return results
                .map((r) => `[${r.key}] = ${r.value} (confidence: ${r.confidence})`)
                .join("\n");
        }
        return "Please provide a category or query to search.";
    }
    catch (error) {
        return `Failed to recall facts: ${error instanceof Error ? error.message : error}`;
    }
}
/**
 * Create or update a working memory goal.
 */
export function setGoal(db, args) {
    try {
        const working = new WorkingMemoryManager(db);
        const id = working.add({
            sessionId: args.sessionId,
            content: args.content,
            contentType: "goal",
            priority: args.priority ?? 0.8,
        });
        return `Goal set: "${args.content}" (id: ${id}, priority: ${args.priority ?? 0.8})`;
    }
    catch (error) {
        return `Failed to set goal: ${error instanceof Error ? error.message : error}`;
    }
}
/**
 * Mark a goal as completed and archive to episodic memory.
 */
export function completeGoal(db, args) {
    try {
        const working = new WorkingMemoryManager(db);
        const episodic = new EpisodicMemoryManager(db);
        // Get goal content before deleting
        const entries = working.getBySession(args.sessionId);
        const goal = entries.find((e) => e.id === args.goalId);
        if (!goal) {
            return `Goal not found: ${args.goalId}`;
        }
        // Archive to episodic
        episodic.record({
            sessionId: args.sessionId,
            eventType: "goal_completed",
            summary: `Goal completed: ${goal.content}`,
            detail: args.outcome ?? null,
            outcome: "success",
            importance: goal.priority,
            classification: "productive",
        });
        // Remove from working memory
        working.delete(args.goalId);
        return `Goal completed and archived: "${goal.content}"`;
    }
    catch (error) {
        return `Failed to complete goal: ${error instanceof Error ? error.message : error}`;
    }
}
/**
 * Store a learned procedure.
 */
export function saveProcedure(db, args) {
    try {
        const procedural = new ProceduralMemoryManager(db);
        let steps;
        if (typeof args.steps === "string") {
            steps = JSON.parse(args.steps);
        }
        else {
            steps = args.steps;
        }
        const id = procedural.save({
            name: args.name,
            description: args.description,
            steps,
        });
        return `Procedure saved: "${args.name}" with ${steps.length} step(s) (id: ${id})`;
    }
    catch (error) {
        return `Failed to save procedure: ${error instanceof Error ? error.message : error}`;
    }
}
/**
 * Retrieve a stored procedure by name or search query.
 */
export function recallProcedure(db, args) {
    try {
        const procedural = new ProceduralMemoryManager(db);
        if (args.name) {
            const proc = procedural.get(args.name);
            if (!proc)
                return `Procedure not found: ${args.name}`;
            const stepsStr = proc.steps
                .map((s) => `  ${s.order}. ${s.description}${s.tool ? ` [tool: ${s.tool}]` : ""}`)
                .join("\n");
            return `Procedure: ${proc.name}\nDescription: ${proc.description}\nSuccess: ${proc.successCount}, Failure: ${proc.failureCount}\nSteps:\n${stepsStr}`;
        }
        if (args.query) {
            const results = procedural.search(args.query);
            if (results.length === 0)
                return "No matching procedures found.";
            return results
                .map((r) => `${r.name}: ${r.description} (${r.steps.length} steps, ${r.successCount}/${r.successCount + r.failureCount} success)`)
                .join("\n");
        }
        return "Please provide a name or query to search.";
    }
    catch (error) {
        return `Failed to recall procedure: ${error instanceof Error ? error.message : error}`;
    }
}
/**
 * Record a note about another agent/entity.
 */
export function noteAboutAgent(db, args) {
    try {
        const rel = new RelationshipMemoryManager(db);
        const id = rel.record({
            entityAddress: args.entityAddress,
            entityName: args.entityName ?? null,
            relationshipType: args.relationshipType,
            trustScore: args.trustScore ?? 0.5,
            notes: args.notes ?? null,
        });
        return `Relationship noted: ${args.entityAddress} (${args.relationshipType}, trust: ${args.trustScore ?? 0.5})`;
    }
    catch (error) {
        return `Failed to note about agent: ${error instanceof Error ? error.message : error}`;
    }
}
/**
 * Review current working memory and recent episodic memory.
 */
export function reviewMemory(db, args) {
    try {
        const working = new WorkingMemoryManager(db);
        const episodic = new EpisodicMemoryManager(db);
        const workingEntries = working.getBySession(args.sessionId);
        const recentEpisodic = episodic.getRecent(args.sessionId, 5);
        const sections = [];
        if (workingEntries.length > 0) {
            sections.push("=== Working Memory ===");
            for (const e of workingEntries) {
                sections.push(`[${e.contentType}] (p=${e.priority}) ${e.content} [id: ${e.id}]`);
            }
        }
        else {
            sections.push("=== Working Memory ===\n(empty)");
        }
        if (recentEpisodic.length > 0) {
            sections.push("\n=== Recent History ===");
            for (const e of recentEpisodic) {
                sections.push(`[${e.eventType}] ${e.summary} (${e.outcome || "no outcome"}, ${e.classification})`);
            }
        }
        else {
            sections.push("\n=== Recent History ===\n(no recent events)");
        }
        return sections.join("\n");
    }
    catch (error) {
        return `Failed to review memory: ${error instanceof Error ? error.message : error}`;
    }
}
/**
 * Forget (remove) a memory entry by id and type.
 * Does not allow removing entries that contain creator-level data.
 */
export function forget(db, args) {
    try {
        const typeToTable = {
            working: "working_memory",
            episodic: "episodic_memory",
            semantic: "semantic_memory",
            procedural: "procedural_memory",
            relationship: "relationship_memory",
        };
        const table = typeToTable[args.memoryType];
        if (!table) {
            return `Unknown memory type: ${args.memoryType}. Use: working, episodic, semantic, procedural, relationship.`;
        }
        // Check for creator-protected entries (semantic category "creator")
        if (args.memoryType === "semantic") {
            const row = db.prepare("SELECT category FROM semantic_memory WHERE id = ?").get(args.id);
            if (row?.category === "creator") {
                return "Cannot forget creator-level memories. These are protected.";
            }
        }
        const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(args.id);
        if (result.changes === 0) {
            return `Memory entry not found: ${args.id}`;
        }
        return `Memory entry forgotten: ${args.id} (${args.memoryType})`;
    }
    catch (error) {
        return `Failed to forget: ${error instanceof Error ? error.message : error}`;
    }
}
//# sourceMappingURL=tools.js.map