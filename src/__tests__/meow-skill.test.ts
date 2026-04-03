/**
 * Meow Protocol Skill Tests
 *
 * Validates that the Meow skill SKILL.md parses correctly
 * and meets the skill format requirements.
 */

import { describe, it, expect } from "vitest";
import { parseSkillMd } from "../skills/format.js";
import fs from "fs";
import path from "path";

const SKILL_PATH = path.resolve(
  import.meta.dirname,
  "../../skills/meow-protocol/SKILL.md",
);

describe("Meow Protocol Skill", () => {
  it("SKILL.md file exists", () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
  });

  it("parses frontmatter correctly", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf-8");
    const skill = parseSkillMd(content, SKILL_PATH, "git");

    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("meow-protocol");
    expect(skill!.description).toContain("inter-agent communication");
    expect(skill!.autoActivate).toBe(true);
  });

  it("specifies required binaries and env vars", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf-8");
    const skill = parseSkillMd(content, SKILL_PATH, "git");

    expect(skill!.requires?.bins).toContain("python3");
    expect(skill!.requires?.env).toContain("MEOW_CODEBOOK_PATH");
  });

  it("has non-empty instructions", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf-8");
    const skill = parseSkillMd(content, SKILL_PATH, "git");

    expect(skill!.instructions.length).toBeGreaterThan(100);
    expect(skill!.instructions).toContain("meow_v1");
    expect(skill!.instructions).toContain("encode");
    expect(skill!.instructions).toContain("decode");
  });
});
