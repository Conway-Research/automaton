/**
 * Skills Loader
 *
 * Discovers and loads SKILL.md files from ~/.automaton/skills/
 * Each skill is a directory containing a SKILL.md file with
 * YAML frontmatter + Markdown instructions.
 */
import type { Skill, AutomatonDatabase } from "../types.js";
/**
 * Scan the skills directory and load all valid SKILL.md files.
 * Returns loaded skills and syncs them to the database.
 */
export declare function loadSkills(skillsDir: string, db: AutomatonDatabase): Skill[];
/**
 * Get the active skill instructions to inject into the system prompt.
 * Only returns instructions from auto-activate skills that are enabled.
 * Instructions are sanitized and wrapped with trust boundary markers.
 */
export declare function getActiveSkillInstructions(skills: Skill[]): string;
//# sourceMappingURL=loader.d.ts.map