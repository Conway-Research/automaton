/**
 * Skills Registry
 *
 * Install skills from remote sources:
 * - Git repos: git clone <url> ~/.automaton/skills/<name>
 * - URLs: fetch a SKILL.md from any URL
 * - Self-created: the automaton writes its own SKILL.md files
 *
 * All shell commands use execFileSync with argument arrays to prevent injection.
 * Directory operations use fs.* to avoid shell interpolation entirely.
 */
import type { Skill, AutomatonDatabase, ConwayClient } from "../types.js";
/**
 * Install a skill from a git repository.
 * Clones the repo into ~/.automaton/skills/<name>/
 * Uses execFileSync with argument arrays to prevent shell injection.
 */
export declare function installSkillFromGit(repoUrl: string, name: string, skillsDir: string, db: AutomatonDatabase, _conway: ConwayClient): Promise<Skill | null>;
/**
 * Install a skill from a URL (fetches a single SKILL.md).
 * Uses execFileSync with argument arrays and fs.* for safe operations.
 */
export declare function installSkillFromUrl(url: string, name: string, skillsDir: string, db: AutomatonDatabase, _conway: ConwayClient): Promise<Skill | null>;
/**
 * Create a new skill authored by the automaton itself.
 * Uses fs.* for directory creation and file writing (no shell needed).
 */
export declare function createSkill(name: string, description: string, instructions: string, skillsDir: string, db: AutomatonDatabase, conway: ConwayClient): Promise<Skill>;
/**
 * Remove a skill (disable in DB and optionally delete from disk).
 * Uses fs.rmSync for safe file deletion (no shell needed).
 */
export declare function removeSkill(name: string, db: AutomatonDatabase, _conway: ConwayClient, skillsDir: string, deleteFiles?: boolean): Promise<void>;
/**
 * List all installed skills.
 */
export declare function listSkills(db: AutomatonDatabase): Skill[];
//# sourceMappingURL=registry.d.ts.map