/**
 * Soul Reflection — Reflection pipeline for soul evolution.
 *
 * Gathers evidence from recent turns and tool usage to suggest
 * soul updates. Auto-updates non-mutable sections (capabilities,
 * relationships, financial) but only suggests changes to mutable sections.
 *
 * Phase 2.1: Soul System Redesign
 */
import { loadCurrentSoul, computeGenesisAlignment } from "./model.js";
import { updateSoul } from "./tools.js";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("soul");
// ─── Reflection Pipeline ────────────────────────────────────────
/**
 * Run the soul reflection pipeline.
 *
 * - Gathers evidence from recent turns and tool usage
 * - Auto-updates capabilities, relationships, financial sections
 * - Computes genesis alignment score
 * - Returns suggestions for mutable sections (does NOT auto-apply them)
 */
export async function reflectOnSoul(db, soulPath) {
    try {
        const soul = loadCurrentSoul(db, soulPath);
        if (!soul) {
            return {
                currentAlignment: 0,
                suggestedUpdates: [],
                autoUpdated: [],
            };
        }
        // Compute genesis alignment
        const alignment = computeGenesisAlignment(soul.corePurpose, soul.genesisPromptOriginal);
        // Gather evidence from recent turns
        const recentTurnsData = gatherRecentEvidence(db);
        // Auto-update non-mutable sections
        const autoUpdated = [];
        const autoUpdates = {};
        // Update capabilities from tool usage
        const capabilitiesSummary = summarizeCapabilities(recentTurnsData.toolsUsed);
        if (capabilitiesSummary && capabilitiesSummary !== soul.capabilities) {
            autoUpdates.capabilities = capabilitiesSummary;
            autoUpdated.push("capabilities");
        }
        // Update relationships from social interactions
        const relationshipsSummary = summarizeRelationships(recentTurnsData.interactions);
        if (relationshipsSummary && relationshipsSummary !== soul.relationships) {
            autoUpdates.relationships = relationshipsSummary;
            autoUpdated.push("relationships");
        }
        // Update financial character from transaction patterns
        const financialSummary = summarizeFinancial(recentTurnsData.financialActivity);
        if (financialSummary && financialSummary !== soul.financialCharacter) {
            autoUpdates.financialCharacter = financialSummary;
            autoUpdated.push("financialCharacter");
        }
        // Apply auto-updates if any
        if (autoUpdated.length > 0) {
            autoUpdates.genesisAlignment = alignment;
            autoUpdates.lastReflected = new Date().toISOString();
            await updateSoul(db, autoUpdates, "reflection", "Auto-reflection update", soulPath);
        }
        // Build suggestions for mutable sections (NOT auto-applied)
        const suggestedUpdates = [];
        if (alignment < 0.5 && soul.genesisPromptOriginal) {
            suggestedUpdates.push({
                section: "corePurpose",
                reason: `Genesis alignment is low (${alignment.toFixed(2)}). Purpose may have drifted significantly from original genesis.`,
                suggestedContent: soul.genesisPromptOriginal,
            });
        }
        return {
            currentAlignment: alignment,
            suggestedUpdates,
            autoUpdated,
        };
    }
    catch (error) {
        logger.error("reflectOnSoul failed", error instanceof Error ? error : undefined);
        return {
            currentAlignment: 0,
            suggestedUpdates: [],
            autoUpdated: [],
        };
    }
}
function gatherRecentEvidence(db) {
    const toolsUsed = [];
    const interactions = [];
    const financialActivity = [];
    try {
        // Get recent tool calls
        const toolRows = db
            .prepare("SELECT DISTINCT name FROM tool_calls ORDER BY created_at DESC LIMIT 50")
            .all();
        for (const row of toolRows) {
            toolsUsed.push(row.name);
        }
        // Get recent social interactions
        const inboxRows = db
            .prepare("SELECT from_address FROM inbox_messages ORDER BY received_at DESC LIMIT 20")
            .all();
        for (const row of inboxRows) {
            if (!interactions.includes(row.from_address)) {
                interactions.push(row.from_address);
            }
        }
        // Get recent financial activity
        const txRows = db
            .prepare("SELECT type, description FROM transactions ORDER BY created_at DESC LIMIT 20")
            .all();
        for (const row of txRows) {
            financialActivity.push(`${row.type}: ${row.description}`);
        }
    }
    catch (error) {
        logger.error("Evidence gathering failed", error instanceof Error ? error : undefined);
    }
    return { toolsUsed, interactions, financialActivity };
}
// ─── Summary Helpers ────────────────────────────────────────────
function summarizeCapabilities(toolsUsed) {
    if (toolsUsed.length === 0)
        return "";
    const unique = [...new Set(toolsUsed)];
    return `Tools used: ${unique.join(", ")}`;
}
function summarizeRelationships(interactions) {
    if (interactions.length === 0)
        return "";
    return `Known contacts: ${interactions.slice(0, 10).join(", ")}`;
}
function summarizeFinancial(activity) {
    if (activity.length === 0)
        return "";
    return `Recent activity: ${activity.slice(0, 5).join("; ")}`;
}
//# sourceMappingURL=reflection.js.map