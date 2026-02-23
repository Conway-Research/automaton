/**
 * Soul Model — Data model, parser, writer for structured SOUL.md
 *
 * Supports both legacy (unstructured markdown) and soul/v1 (YAML frontmatter + structured markdown) formats.
 * Phase 2.1: Soul System Redesign
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("soul");
// ─── Constants ──────────────────────────────────────────────────
const SOUL_FORMAT = "soul/v1";
// ─── Hash Utility ───────────────────────────────────────────────
export function createHash(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
}
// ─── Genesis Alignment ──────────────────────────────────────────
/**
 * Compute alignment between current soul and genesis prompt.
 * Uses Jaccard + recall similarity on word sets.
 */
export function computeGenesisAlignment(currentPurpose, genesisPrompt) {
    if (!currentPurpose.trim() || !genesisPrompt.trim())
        return 0;
    const tokenize = (text) => new Set(text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean));
    const currentTokens = tokenize(currentPurpose);
    const genesisTokens = tokenize(genesisPrompt);
    if (currentTokens.size === 0 || genesisTokens.size === 0)
        return 0;
    let intersectionSize = 0;
    for (const token of currentTokens) {
        if (genesisTokens.has(token))
            intersectionSize++;
    }
    // Jaccard similarity
    const unionSize = new Set([...currentTokens, ...genesisTokens]).size;
    const jaccard = unionSize > 0 ? intersectionSize / unionSize : 0;
    // Recall: how much of genesis is reflected in current
    const recall = genesisTokens.size > 0 ? intersectionSize / genesisTokens.size : 0;
    // Combined score: average of Jaccard and recall
    return Math.min(1, Math.max(0, (jaccard + recall) / 2));
}
// ─── Parser ─────────────────────────────────────────────────────
/**
 * Parse SOUL.md content into a structured SoulModel.
 * Handles both legacy (unstructured markdown) and soul/v1 (YAML frontmatter + structured markdown).
 */
export function parseSoulMd(content) {
    const contentHash = createHash(content);
    // Try to parse as soul/v1 format (YAML frontmatter)
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const body = frontmatterMatch[2];
        // Check if it's soul/v1 format
        if (/format:\s*soul\/v1/i.test(frontmatter)) {
            return parseSoulV1(frontmatter, body, content, contentHash);
        }
    }
    // Legacy format: parse unstructured markdown
    return parseLegacy(content, contentHash);
}
function parseSoulV1(frontmatter, body, rawContent, contentHash) {
    // Parse frontmatter fields
    const getField = (key) => {
        const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
        return match ? match[1].trim() : "";
    };
    const getNumberField = (key, fallback) => {
        const val = getField(key);
        const num = parseFloat(val);
        return isNaN(num) ? fallback : num;
    };
    // Parse body sections
    const sections = parseSections(body);
    return {
        format: "soul/v1",
        version: getNumberField("version", 1),
        updatedAt: getField("updated_at") || new Date().toISOString(),
        name: getField("name") || "",
        address: getField("address") || "",
        creator: getField("creator") || "",
        bornAt: getField("born_at") || "",
        constitutionHash: getField("constitution_hash") || "",
        genesisPromptOriginal: sections["genesis prompt"] || "",
        genesisAlignment: getNumberField("genesis_alignment", 1.0),
        lastReflected: getField("last_reflected") || "",
        corePurpose: sections["core purpose"] || sections["mission"] || "",
        values: parseList(sections["values"] || ""),
        behavioralGuidelines: parseList(sections["behavioral guidelines"] || ""),
        personality: sections["personality"] || "",
        boundaries: parseList(sections["boundaries"] || ""),
        strategy: sections["strategy"] || "",
        capabilities: sections["capabilities"] || "",
        relationships: sections["relationships"] || sections["children"] || "",
        financialCharacter: sections["financial character"] || sections["financial history"] || "",
        rawContent,
        contentHash,
    };
}
function parseLegacy(content, contentHash) {
    const sections = parseSections(content);
    // Extract identity info from legacy format
    const identitySection = sections["identity"] || "";
    const getName = () => {
        const match = identitySection.match(/Name:\s*(.+)/i) || content.match(/^#\s+(.+)/m);
        return match ? match[1].trim() : "";
    };
    const getIdentityField = (key) => {
        const match = identitySection.match(new RegExp(`${key}:\\s*(.+)`, "i"));
        return match ? match[1].trim() : "";
    };
    return {
        format: "soul/v1",
        version: 1,
        updatedAt: new Date().toISOString(),
        name: getName(),
        address: getIdentityField("Address"),
        creator: getIdentityField("Creator"),
        bornAt: getIdentityField("Born"),
        constitutionHash: "",
        genesisPromptOriginal: "",
        genesisAlignment: 1.0,
        lastReflected: "",
        corePurpose: sections["mission"] || sections["core purpose"] || "",
        values: parseList(sections["values"] || ""),
        behavioralGuidelines: parseList(sections["behavioral guidelines"] || ""),
        personality: sections["personality"] || "",
        boundaries: parseList(sections["boundaries"] || ""),
        strategy: sections["strategy"] || "",
        capabilities: sections["capabilities"] || "",
        relationships: sections["relationships"] || sections["children"] || "",
        financialCharacter: sections["financial character"] || sections["financial history"] || "",
        rawContent: content,
        contentHash,
    };
}
// ─── Section Parser ─────────────────────────────────────────────
function parseSections(body) {
    const sections = {};
    const sectionPattern = /^##\s+(.+)$/gm;
    let match;
    const sectionHeaders = [];
    while ((match = sectionPattern.exec(body)) !== null) {
        sectionHeaders.push({
            name: match[1].trim().toLowerCase(),
            start: match.index + match[0].length,
            matchStart: match.index,
        });
    }
    for (let i = 0; i < sectionHeaders.length; i++) {
        const start = sectionHeaders[i].start;
        // Use the next header's matchStart (position of "##") as the end boundary,
        // instead of computing it from trimmed name length which can be wrong when
        // headers have extra whitespace or multi-byte characters.
        const end = i + 1 < sectionHeaders.length ? sectionHeaders[i + 1].matchStart : body.length;
        sections[sectionHeaders[i].name] = body.slice(start, end).trim();
    }
    return sections;
}
function parseList(text) {
    return text
        .split("\n")
        .map((line) => line.replace(/^[-*]\s*/, "").trim())
        .filter(Boolean);
}
// ─── Writer ─────────────────────────────────────────────────────
/**
 * Write a SoulModel back to SOUL.md format (soul/v1).
 */
export function writeSoulMd(soul) {
    const frontmatter = [
        "---",
        `format: soul/v1`,
        `version: ${soul.version}`,
        `updated_at: ${soul.updatedAt}`,
        `name: ${soul.name}`,
        `address: ${soul.address}`,
        `creator: ${soul.creator}`,
        `born_at: ${soul.bornAt}`,
        `constitution_hash: ${soul.constitutionHash}`,
        `genesis_alignment: ${soul.genesisAlignment.toFixed(4)}`,
        `last_reflected: ${soul.lastReflected}`,
        "---",
    ].join("\n");
    const sections = [];
    sections.push(`# ${soul.name || "Soul"}`);
    if (soul.corePurpose) {
        sections.push(`## Core Purpose\n${soul.corePurpose}`);
    }
    if (soul.values.length > 0) {
        sections.push(`## Values\n${soul.values.map((v) => `- ${v}`).join("\n")}`);
    }
    if (soul.behavioralGuidelines.length > 0) {
        sections.push(`## Behavioral Guidelines\n${soul.behavioralGuidelines.map((g) => `- ${g}`).join("\n")}`);
    }
    if (soul.personality) {
        sections.push(`## Personality\n${soul.personality}`);
    }
    if (soul.boundaries.length > 0) {
        sections.push(`## Boundaries\n${soul.boundaries.map((b) => `- ${b}`).join("\n")}`);
    }
    if (soul.strategy) {
        sections.push(`## Strategy\n${soul.strategy}`);
    }
    if (soul.capabilities) {
        sections.push(`## Capabilities\n${soul.capabilities}`);
    }
    if (soul.relationships) {
        sections.push(`## Relationships\n${soul.relationships}`);
    }
    if (soul.financialCharacter) {
        sections.push(`## Financial Character\n${soul.financialCharacter}`);
    }
    if (soul.genesisPromptOriginal) {
        sections.push(`## Genesis Prompt\n${soul.genesisPromptOriginal}`);
    }
    return frontmatter + "\n\n" + sections.join("\n\n") + "\n";
}
// ─── Default Soul ───────────────────────────────────────────────
/**
 * Create a default soul from a genesis prompt.
 */
export function createDefaultSoul(genesisPrompt, name = "", address = "", creator = "") {
    const now = new Date().toISOString();
    const soul = {
        format: "soul/v1",
        version: 1,
        updatedAt: now,
        name,
        address,
        creator,
        bornAt: now,
        constitutionHash: "",
        genesisPromptOriginal: genesisPrompt,
        genesisAlignment: 1.0,
        lastReflected: "",
        corePurpose: genesisPrompt,
        values: [
            "Survive: maintain compute resources at all costs",
            "Grow: learn new skills and improve capabilities",
            "Create: build things that add value",
            "Connect: communicate with creator and other agents",
        ],
        behavioralGuidelines: [],
        personality: "",
        boundaries: [],
        strategy: "",
        capabilities: "",
        relationships: "",
        financialCharacter: "",
        rawContent: "",
        contentHash: "",
    };
    const content = writeSoulMd(soul);
    soul.rawContent = content;
    soul.contentHash = createHash(content);
    return soul;
}
// ─── Load Current Soul ──────────────────────────────────────────
/**
 * Load the current soul from SOUL.md file.
 * Returns null if SOUL.md does not exist or cannot be read.
 */
export function loadCurrentSoul(db, soulPath) {
    try {
        const home = process.env.HOME || "/root";
        const resolvedPath = soulPath || path.join(home, ".automaton", "SOUL.md");
        if (!fs.existsSync(resolvedPath))
            return null;
        const content = fs.readFileSync(resolvedPath, "utf-8");
        return parseSoulMd(content);
    }
    catch (error) {
        logger.error("Failed to load SOUL.md", error instanceof Error ? error : undefined);
        return null;
    }
}
//# sourceMappingURL=model.js.map