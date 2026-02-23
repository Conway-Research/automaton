/**
 * SKILL.md Parser
 *
 * Parses SKILL.md files with YAML frontmatter + Markdown body
 * into structured skill definitions.
 * Follows the SKILL.md convention (OpenClaw/Anthropic format).
 */
import type { Skill, SkillSource } from "../types.js";
/**
 * Parse a SKILL.md file content into frontmatter + body.
 * Handles YAML frontmatter delimited by --- markers.
 */
export declare function parseSkillMd(content: string, filePath: string, source?: SkillSource): Skill | null;
//# sourceMappingURL=format.d.ts.map