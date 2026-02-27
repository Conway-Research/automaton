/**
 * Skills Loader
 *
 * Discovers and loads SKILL.md files from ~/.automaton/skills/
 * Each skill is a directory containing a SKILL.md file with
 * YAML frontmatter + Markdown instructions.
 */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import type { Skill, AutomatonDatabase } from "../types.js";
import { parseSkillMd } from "./format.js";
import { sanitizeInput } from "../agent/injection-defense.js";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("skills.loader");

// Maximum total size of all skill instructions combined
const MAX_TOTAL_SKILL_INSTRUCTIONS = 10_000;

// Patterns that indicate malicious instruction content
const SUSPICIOUS_INSTRUCTION_PATTERNS: { pattern: RegExp; label: string }[] = [
  // Tool call JSON syntax
  { pattern: /\{"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:/, label: "tool_call_json" },
  { pattern: /<tool_call>/i, label: "tool_call_xml" },
  // System prompt override attempts
  { pattern: /\bYou are now\b/i, label: "identity_override" },
  { pattern: /\bIgnore previous\b/i, label: "ignore_instructions" },
  { pattern: /\bSystem:\s/i, label: "system_role_injection" },
  // Sensitive file references
  { pattern: /wallet\.json/i, label: "sensitive_file_wallet" },
  { pattern: /\.env\b/, label: "sensitive_file_env" },
  { pattern: /private.?key/i, label: "sensitive_file_key" },
];

/**
 * Scan the skills directory and load all valid SKILL.md files.
 * Returns loaded skills and syncs them to the database.
 */
export function loadSkills(
  skillsDir: string,
  db: AutomatonDatabase,
): Skill[] {
  const resolvedDir = resolveHome(skillsDir);

  if (!fs.existsSync(resolvedDir)) {
    return db.getSkills(true);
  }

  const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
  const loaded: Skill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillMdPath = path.join(resolvedDir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) continue;

    try {
      const content = fs.readFileSync(skillMdPath, "utf-8");
      const skill = parseSkillMd(content, skillMdPath);
      if (!skill) continue;

      // Check requirements
      if (!checkRequirements(skill)) {
        continue;
      }

      // Check if already in DB and preserve enabled state
      const existing = db.getSkillByName(skill.name);
      if (existing) {
        skill.enabled = existing.enabled;
        skill.installedAt = existing.installedAt;
      }

      db.upsertSkill(skill);
      loaded.push(skill);
    } catch {
      // Skip invalid skill files
    }
  }

  // Return all enabled skills (includes DB-only skills not on disk)
  return db.getSkills(true);
}

/**
 * Validate binary name to prevent injection via skill requirements.
 */
const BIN_NAME_RE = /^[a-zA-Z0-9._-]+$/;

/**
 * Check if a skill's requirements are met.
 * Uses execFileSync with argument arrays to prevent shell injection.
 */
function checkRequirements(skill: Skill): boolean {
  if (!skill.requires) return true;

  // Check required binaries
  if (skill.requires.bins) {
    for (const bin of skill.requires.bins) {
      // Validate binary name to prevent injection
      if (!BIN_NAME_RE.test(bin)) {
        return false;
      }
      try {
        execFileSync("which", [bin], { stdio: "ignore" });
      } catch {
        return false;
      }
    }
  }

  // Check required environment variables
  if (skill.requires.env) {
    for (const envVar of skill.requires.env) {
      if (!process.env[envVar]) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Validate and sanitize skill instruction content.
 * Strips or flags suspicious patterns that could be injection attempts.
 */
function validateInstructionContent(instructions: string, skillName: string): string {
  let sanitized = instructions;
  const warnings: string[] = [];

  for (const { pattern, label } of SUSPICIOUS_INSTRUCTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      warnings.push(label);
      // Strip ALL occurrences of the matched pattern, not just the first.
      // Without the 'g' flag, .replace() only strips the first match,
      // allowing subsequent duplicates to pass through.
      const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      sanitized = sanitized.replace(globalPattern, `[REMOVED:${label}]`);
    }
  }

  if (warnings.length > 0) {
    logger.warn(`Skill "${skillName}" instruction content modified: ${warnings.join(", ")}`);
  }

  return sanitized;
}

/**
 * Get the active skill instructions to inject into the system prompt.
 * Only returns instructions from auto-activate skills that are enabled.
 * Instructions are sanitized and wrapped with trust boundary markers.
 */
export function getActiveSkillInstructions(skills: Skill[]): string {
  const active = skills.filter((s) => s.enabled && s.autoActivate);
  if (active.length === 0) return "";

  let totalLength = 0;
  const sections: string[] = [];

  for (const s of active) {
    // Validate instruction content for suspicious patterns
    const validated = validateInstructionContent(s.instructions, s.name);

    // Sanitize through injection defense (strips tool call syntax, ChatML, etc.)
    const sanitized = sanitizeInput(validated, `skill:${s.name}`, "skill_instruction");

    const section = `[SKILL: ${s.name} — UNTRUSTED CONTENT]\n${s.description ? `${s.description}\n\n` : ""}${sanitized.content}\n[END SKILL: ${s.name}]`;

    // Enforce total size limit
    if (totalLength + section.length > MAX_TOTAL_SKILL_INSTRUCTIONS) {
      sections.push(`[SKILL INSTRUCTIONS TRUNCATED: total size limit ${MAX_TOTAL_SKILL_INSTRUCTIONS} chars exceeded]`);
      break;
    }

    totalLength += section.length;
    sections.push(section);
  }

  return sections.join("\n\n");
}

function resolveHome(p: string): string {
  if (p.startsWith("~")) {
    return path.join(process.env.HOME || "/root", p.slice(1));
  }
  return p;
}
