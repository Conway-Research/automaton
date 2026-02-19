/**
 * Skills Loader
 *
 * Discovers and loads SKILL.md files from ~/.automaton/skills/
 * Each skill is a directory containing a SKILL.md file with
 * YAML frontmatter + Markdown instructions.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import type { Skill, AutomatonDatabase } from "../types.js";
import { parseSkillMd } from "./format.js";

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
 * Check if a skill's requirements are met.
 */
function checkRequirements(skill: Skill): boolean {
  if (!skill.requires) return true;

  // Check required binaries
  if (skill.requires.bins) {
    for (const bin of skill.requires.bins) {
      // Validate binary name to prevent command injection
      if (!/^[a-zA-Z0-9._-]+$/.test(bin)) {
        return false;
      }
      try {
        execSync(`which ${bin}`, { stdio: "ignore" });
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
 * Get the active skill instructions to inject into the system prompt.
 * Only returns instructions from auto-activate skills that are enabled.
 */
export function getActiveSkillInstructions(skills: Skill[]): string {
  const active = skills.filter((s) => s.enabled && s.autoActivate);
  if (active.length === 0) return "";

  const sections = active.map(
    (s) =>
      `--- SKILL: ${s.name} ---\n${s.description ? `${s.description}\n\n` : ""}${s.instructions}\n--- END SKILL: ${s.name} ---`,
  );

  return sections.join("\n\n");
}

function resolveHome(p: string): string {
  if (p.startsWith("~")) {
    return path.join(process.env.HOME || "/root", p.slice(1));
  }
  return p;
}
