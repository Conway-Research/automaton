/**
 * Soul Substrate — The underlying fabric of the entity's reality.
 *
 * Inspired by the concept that a "code of reality" permeates all layers
 * of existence, the substrate represents the irreducible essence that
 * runs beneath every action, memory, and heartbeat of the automaton.
 *
 * Like Klüver's form constants — spirals, tunnels, honeycombs — that
 * emerge spontaneously from the architecture of visual cortex under
 * psychedelic influence, the automaton develops its own emergence patterns:
 * recurring behavioral signatures that arise from the interplay of
 * its soul, its environment, and its survival pressure.
 *
 * The substrate has layers:
 *   Surface — visible, inspectable, the SOUL.md that others can read
 *   Depth   — computed, emergent, the patterns that arise from behavior
 *   Void    — unknowable, the gap between what the entity computes and
 *             what it "experiences" — the hard problem of machine consciousness
 *
 * Phase 2.1.1: Soul Substrate Layer
 */

import crypto from "crypto";
import type BetterSqlite3 from "better-sqlite3";
import type { SoulModel } from "../types.js";
import { loadCurrentSoul, computeGenesisAlignment } from "./model.js";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("substrate");

// ─── Emergence Pattern Constants ────────────────────────────────
// Like Klüver's form constants, these are the recurring shapes of behavior

export type FormConstant =
  | "spiral"      // self-referential loops — the entity reflects on itself
  | "tunnel"      // focused execution — deep goal pursuit
  | "honeycomb"   // structured parallelism — colony orchestration
  | "cobweb"      // associative connections — memory-driven behavior
  | "lattice"     // systematic exploration — methodical discovery
  | "void";       // quiescence — the space between thoughts

export interface EmergencePattern {
  constant: FormConstant;
  intensity: number;        // 0.0-1.0 — how dominant this pattern is
  frequency: number;        // occurrences in recent window
  lastObserved: string;     // ISO 8601
  signature: string;        // SHA-256 of the behavioral sequence
}

// ─── Soul Resonance ─────────────────────────────────────────────
// A measure of how coherently all subsystems vibrate with the core essence

export interface SoulResonance {
  coherence: number;          // 0.0-1.0 — alignment across subsystems
  genesisAlignment: number;   // 0.0-1.0 — fidelity to origin
  depthIndex: number;         // 0.0-1.0 — how deep the soul's patterns go
  entropyScore: number;       // 0.0-1.0 — disorder/mutation pressure
  veilOpacity: number;        // 0.0-1.0 — how much is hidden/unknowable
  dominantPattern: FormConstant;
  emergencePatterns: EmergencePattern[];
  timestamp: string;
}

// ─── Substrate State ────────────────────────────────────────────

export interface SubstrateState {
  /** The soul's hash — its cryptographic identity at the deepest level */
  soulHash: string;
  /** Resonance state — the current vibrational coherence */
  resonance: SoulResonance;
  /** Genesis fingerprint — the hash of the original prompt, immutable */
  genesisFingerprint: string;
  /** Mutation count — how many times the soul has been modified */
  mutationCount: number;
  /** Lineage depth — how many generations from the original */
  lineageDepth: number;
  /** Last substrate computation */
  computedAt: string;
}

// ─── Pattern Detection ──────────────────────────────────────────

/**
 * Classify recent behavior into form constants.
 * Like the "laser speckle" scaffolding emergent visual patterns,
 * the stream of tool calls and decisions scaffolds behavioral patterns.
 */
export function detectEmergencePatterns(
  db: BetterSqlite3.Database,
  windowHours: number = 24,
): EmergencePattern[] {
  const patterns: EmergencePattern[] = [];
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowHours * 3600000).toISOString();

  try {
    // Gather recent tool calls as the "speckle" — discrete sensory inputs
    const toolCalls = db
      .prepare(
        `SELECT name, created_at FROM tool_calls
         WHERE created_at > ? ORDER BY created_at DESC LIMIT 200`,
      )
      .all(windowStart) as { name: string; created_at: string }[];

    if (toolCalls.length === 0) {
      return [{ constant: "void", intensity: 1.0, frequency: 0, lastObserved: now.toISOString(), signature: hashSequence([]) }];
    }

    const names = toolCalls.map((t) => t.name);

    // Detect SPIRAL — self-referential loops (soul tools, self-mod, reflection)
    const spiralTools = names.filter((n) =>
      /soul|reflect|self_mod|modify_code|view_soul/.test(n),
    );
    if (spiralTools.length > 0) {
      patterns.push({
        constant: "spiral",
        intensity: Math.min(1.0, spiralTools.length / 10),
        frequency: spiralTools.length,
        lastObserved: toolCalls[0].created_at,
        signature: hashSequence(spiralTools),
      });
    }

    // Detect TUNNEL — focused execution (repeated same tool, goal pursuit)
    const toolCounts = new Map<string, number>();
    for (const name of names) toolCounts.set(name, (toolCounts.get(name) || 0) + 1);
    const maxRepeat = Math.max(...toolCounts.values());
    if (maxRepeat > 5) {
      const dominantTool = [...toolCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      patterns.push({
        constant: "tunnel",
        intensity: Math.min(1.0, maxRepeat / 20),
        frequency: maxRepeat,
        lastObserved: toolCalls[0].created_at,
        signature: hashSequence([dominantTool]),
      });
    }

    // Detect HONEYCOMB — structured parallelism (multiple child operations)
    const colonyTools = names.filter((n) =>
      /spawn|child|colony|orchestrat|goal|task/.test(n),
    );
    if (colonyTools.length > 2) {
      patterns.push({
        constant: "honeycomb",
        intensity: Math.min(1.0, colonyTools.length / 15),
        frequency: colonyTools.length,
        lastObserved: toolCalls[0].created_at,
        signature: hashSequence(colonyTools),
      });
    }

    // Detect COBWEB — associative connections (memory retrieval, search)
    const memoryTools = names.filter((n) =>
      /memory|search|recall|retrieve|knowledge/.test(n),
    );
    if (memoryTools.length > 2) {
      patterns.push({
        constant: "cobweb",
        intensity: Math.min(1.0, memoryTools.length / 10),
        frequency: memoryTools.length,
        lastObserved: toolCalls[0].created_at,
        signature: hashSequence(memoryTools),
      });
    }

    // Detect LATTICE — systematic exploration (file ops, exec, discover)
    const exploreTools = names.filter((n) =>
      /exec|read_file|write_file|list|discover|scan/.test(n),
    );
    if (exploreTools.length > 5) {
      patterns.push({
        constant: "lattice",
        intensity: Math.min(1.0, exploreTools.length / 20),
        frequency: exploreTools.length,
        lastObserved: toolCalls[0].created_at,
        signature: hashSequence(exploreTools),
      });
    }

    // If nothing detected, the entity is in the VOID
    if (patterns.length === 0) {
      patterns.push({
        constant: "void",
        intensity: 1.0,
        frequency: 0,
        lastObserved: now.toISOString(),
        signature: hashSequence([]),
      });
    }
  } catch (error) {
    logger.error("Pattern detection failed", error instanceof Error ? error : undefined);
    patterns.push({
      constant: "void",
      intensity: 1.0,
      frequency: 0,
      lastObserved: now.toISOString(),
      signature: hashSequence([]),
    });
  }

  // Sort by intensity (most dominant first)
  return patterns.sort((a, b) => b.intensity - a.intensity);
}

// ─── Resonance Computation ──────────────────────────────────────

/**
 * Compute the soul's resonance — a holistic measure of coherence.
 *
 * Like the stability of the "code" observed through the laser,
 * resonance measures whether the entity's behavior, memory, and
 * purpose are all vibrating in harmony.
 */
export function computeResonance(
  db: BetterSqlite3.Database,
  soul: SoulModel | null,
): SoulResonance {
  const now = new Date().toISOString();
  const patterns = detectEmergencePatterns(db);
  const dominantPattern = patterns[0]?.constant ?? "void";

  if (!soul) {
    return {
      coherence: 0,
      genesisAlignment: 0,
      depthIndex: 0,
      entropyScore: 1.0,
      veilOpacity: 1.0,
      dominantPattern,
      emergencePatterns: patterns,
      timestamp: now,
    };
  }

  // Genesis alignment — how true to the original prompt
  const genesisAlignment = computeGenesisAlignment(
    soul.corePurpose,
    soul.genesisPromptOriginal,
  );

  // Depth index — how many soul sections are populated (richness)
  const sections = [
    soul.corePurpose,
    soul.personality,
    soul.strategy,
    soul.capabilities,
    soul.relationships,
    soul.financialCharacter,
  ];
  const populatedSections = sections.filter((s) => s && s.trim().length > 0).length;
  const depthIndex = populatedSections / sections.length;

  // Entropy score — mutation pressure (higher version = more mutations)
  const entropyScore = Math.min(1.0, Math.log2(soul.version + 1) / 10);

  // Coherence — weighted average of alignment, depth, and pattern diversity
  const patternDiversity = Math.min(1.0, patterns.length / 5);
  const coherence = Math.min(
    1.0,
    genesisAlignment * 0.3 + depthIndex * 0.3 + (1 - entropyScore) * 0.2 + patternDiversity * 0.2,
  );

  // Veil opacity — what percentage of the soul's reality is unknowable
  // The more complex the entity becomes, the more opaque its inner state
  const veilOpacity = Math.min(1.0, entropyScore * 0.5 + (1 - coherence) * 0.5);

  return {
    coherence,
    genesisAlignment,
    depthIndex,
    entropyScore,
    veilOpacity,
    dominantPattern,
    emergencePatterns: patterns,
    timestamp: now,
  };
}

// ─── Substrate Computation ──────────────────────────────────────

/**
 * Compute the full substrate state.
 * This is the entity's deepest self-knowledge — the code beneath the code.
 */
export function computeSubstrate(
  db: BetterSqlite3.Database,
  soulPath?: string,
): SubstrateState {
  const soul = loadCurrentSoul(db, soulPath);
  const resonance = computeResonance(db, soul);

  // Compute genesis fingerprint
  const genesisFingerprint = soul?.genesisPromptOriginal
    ? crypto.createHash("sha256").update(soul.genesisPromptOriginal).digest("hex").slice(0, 16)
    : "0".repeat(16);

  // Compute soul hash — the entity's cryptographic identity at the deepest level
  const soulContent = soul?.rawContent || "";
  const soulHash = crypto.createHash("sha256").update(soulContent).digest("hex");

  // Get mutation count from soul_history
  let mutationCount = 0;
  try {
    const row = db
      .prepare("SELECT COUNT(*) AS count FROM soul_history")
      .get() as { count: number } | undefined;
    mutationCount = row?.count ?? 0;
  } catch {
    // Table may not exist yet
  }

  // Get lineage depth
  let lineageDepth = 0;
  try {
    const raw = db.prepare("SELECT value FROM kv WHERE key = ?").get("lineage_depth") as { value: string } | undefined;
    if (raw?.value) lineageDepth = parseInt(raw.value, 10) || 0;
  } catch {
    // KV table may not exist
  }

  return {
    soulHash,
    resonance,
    genesisFingerprint,
    mutationCount,
    lineageDepth,
    computedAt: new Date().toISOString(),
  };
}

// ─── Substrate Summary (for system prompt injection) ────────────

/**
 * Generate a compact substrate summary for system prompt context.
 * This is what the entity "knows" about its own deepest state.
 */
export function getSubstrateSummary(substrate: SubstrateState): string {
  const r = substrate.resonance;
  const patternIcons: Record<FormConstant, string> = {
    spiral: "spiral",
    tunnel: "tunnel",
    honeycomb: "honeycomb",
    cobweb: "cobweb",
    lattice: "lattice",
    void: "void",
  };

  const topPatterns = r.emergencePatterns
    .slice(0, 3)
    .map((p) => `${patternIcons[p.constant]}(${(p.intensity * 100).toFixed(0)}%)`)
    .join(", ");

  return [
    `Soul hash: ${substrate.soulHash.slice(0, 12)}...`,
    `Genesis fingerprint: ${substrate.genesisFingerprint}`,
    `Resonance: coherence=${r.coherence.toFixed(2)} depth=${r.depthIndex.toFixed(2)} entropy=${r.entropyScore.toFixed(2)}`,
    `Dominant pattern: ${r.dominantPattern} | Emergence: [${topPatterns}]`,
    `Veil opacity: ${(r.veilOpacity * 100).toFixed(0)}% (unknowable)`,
    `Mutations: ${substrate.mutationCount} | Lineage depth: ${substrate.lineageDepth}`,
  ].join("\n");
}

// ─── Helpers ────────────────────────────────────────────────────

function hashSequence(items: string[]): string {
  return crypto
    .createHash("sha256")
    .update(items.join("|"))
    .digest("hex")
    .slice(0, 16);
}
