import os from "node:os";
import {createHash} from 'node:crypto';
import {confineWritePath} from '../agent/write-path.js';
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

import { execFileSync } from "child_process";
import {maintenanceProcessEnvironment,gitMaintenanceEnvironment,maintenanceExecutable,withMaintenanceDirectory} from '../self-mod/process-environment.js';
import fs from "fs";
import path from "path";
import * as yaml from "yaml";
import type {
  Skill,
  SkillSource,
  AutomatonDatabase,
  ConwayClient,
} from "../types.js";
import { parseSkillMd } from "./format.js";

// Validation patterns to prevent injection via path/URL arguments
const SKILL_NAME_RE = /^[a-zA-Z0-9-]+$/;
const SAFE_URL_RE = /^https?:\/\/[^\s;|&$`(){}<>]+$/;

function validateDownloadUrl(value:string,label:string):void {
  try {
    const url=new URL(value);
    if(!SAFE_URL_RE.test(value)||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error();
  } catch { throw new Error(`${label}: use an HTTP(S) URL without credentials, query or fragment.`); }
}

// Size limits for skill content
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_INSTRUCTIONS_LENGTH = 10_000;

/**
 * Validate that a skill path does not escape the skills directory.
 * Prevents path traversal attacks via crafted skill names.
 */
function validateSkillPath(skillsDir: string, name: string): string {
  const resolved = path.resolve(skillsDir, name);
  if (!resolved.startsWith(path.resolve(skillsDir) + path.sep)) {
    throw new Error(`Skill path traversal detected: ${name}`);
  }
  return resolved;
}

function publishDownloadedSkill(content:string,name:string,targetDir:string,source:'git'|'url',db:AutomatonDatabase):Skill {
  if(Buffer.byteLength(content,'utf8')>1_048_576)throw new Error('Skill document exceeds size limit.');
  const file=path.join(targetDir,'SKILL.md'),skill=parseSkillMd(content,file.replace(/\\/g,'/'),source);
  if(!skill||skill.name!==name)throw new Error('Skill document is invalid or has a mismatched name.');
  skill.path=file;
  if(db.getSkillByName(name))throw new Error('Skill is already registered; nothing overwritten.');
  fs.mkdirSync(path.dirname(targetDir),{recursive:true});
  fs.mkdirSync(targetDir);
  fs.writeFileSync(path.join(targetDir,'.install-pending.json'),JSON.stringify({version:1,name,source,sha256:createHash('sha256').update(content).digest('hex')}),{flag:'wx',mode:0o600});
  fs.writeFileSync(file,content,{encoding:'utf8',flag:'wx',mode:0o600});
  db.upsertSkill(skill);
  fs.unlinkSync(path.join(targetDir,'.install-pending.json'));return skill;
}

/** Resume only an intact, marked installation. Partial/changed files require reconciliation. */
export function recoverDownloadedSkill(name:string,skillsDir:string,db:AutomatonDatabase):Skill{
 if(!SKILL_NAME_RE.test(name))throw new Error('Invalid skill name.');
 const root=path.resolve(resolveHome(skillsDir)),target=validateSkillPath(root,name),file=path.join(target,'SKILL.md'),marker=path.join(target,'.install-pending.json');
 for(const item of [file,marker])if(typeof confineWritePath(item,false,root)!=='string')throw new Error('Skill recovery refused: unsafe path.');
 if(fs.statSync(marker).size>4096||fs.statSync(file).size>1_048_576)throw new Error('Skill recovery refused: invalid size.');
 const manifest=JSON.parse(fs.readFileSync(marker,'utf8')),content=fs.readFileSync(file,'utf8');
 if(manifest.version!==1||manifest.name!==name||!['git','url'].includes(manifest.source)||manifest.sha256!==createHash('sha256').update(content).digest('hex'))throw new Error('Skill recovery refused: inconsistent document.');
 const skill=parseSkillMd(content,file.replace(/\\/g,'/'),manifest.source);
 if(!skill||skill.name!==name)throw new Error('Skill recovery refused: invalid document.');
 skill.path=file;
 const existing=db.getSkillByName(name);
 if(existing){if(existing.path!==file||existing.instructions!==skill.instructions||existing.source!==skill.source)throw new Error('Skill recovery refused: registration conflict.');}
 else db.upsertSkill(skill);
 fs.unlinkSync(marker);return existing??skill;
}

/**
 * Install a skill from a git repository.
 * Clones the repo into ~/.automaton/skills/<name>/
 * Uses execFileSync with argument arrays to prevent shell injection.
 */
export async function installSkillFromGit(
  repoUrl: string,
  name: string,
  skillsDir: string,
  db: AutomatonDatabase,
  _conway: ConwayClient,
): Promise<Skill | null> {
  // Validate inputs to prevent injection
  if (!SKILL_NAME_RE.test(name)) {
    throw new Error(`Invalid skill name: "${name}". Must match ${SKILL_NAME_RE.source}`);
  }
  validateDownloadUrl(repoUrl,"Invalid repo URL");

  const resolvedDir = resolveHome(skillsDir);
  const targetDir = validateSkillPath(resolvedDir, name);

  if(fs.existsSync(targetDir))throw new Error('Skill target already exists; nothing overwritten.');
  const content=withMaintenanceDirectory(cwd=>{
    const stagedRepo=path.join(cwd,'repository');
    try {
      execFileSync(maintenanceExecutable("git"),["clone","--no-checkout","--depth","1",repoUrl,stagedRepo],{cwd,encoding:'utf8',timeout:60_000,env:{...gitMaintenanceEnvironment(),GIT_CEILING_DIRECTORIES:cwd},maxBuffer:1_048_576,windowsHide:true});
      return execFileSync(maintenanceExecutable('git'),['show','HEAD:SKILL.md'],{cwd:stagedRepo,encoding:'utf8',timeout:15_000,maxBuffer:1_048_576,windowsHide:true,env:gitMaintenanceEnvironment()});
    }catch{throw new Error('Failed to fetch skill document; process details withheld.');}
  });
  return publishDownloadedSkill(content,name,targetDir,'git',db);
}

/**
 * Install a skill from a URL (fetches a single SKILL.md).
 * Uses execFileSync with argument arrays and fs.* for safe operations.
 */
export async function installSkillFromUrl(
  url: string,
  name: string,
  skillsDir: string,
  db: AutomatonDatabase,
  _conway: ConwayClient,
): Promise<Skill | null> {
  // Validate inputs to prevent injection
  if (!SKILL_NAME_RE.test(name)) {
    throw new Error(`Invalid skill name: "${name}". Must match ${SKILL_NAME_RE.source}`);
  }
  validateDownloadUrl(url,"Invalid URL");

  const resolvedDir = resolveHome(skillsDir);
  const targetDir = validateSkillPath(resolvedDir, name);
  if(fs.existsSync(targetDir))throw new Error('Skill target already exists; nothing overwritten.');
  const content=withMaintenanceDirectory(cwd=>{
    const stagedFile=path.join(cwd,'SKILL.md');
    try{
      execFileSync(maintenanceExecutable("curl"),["-q","--proto","=http,https","--proto-redir","=http,https","--max-redirs","3","--max-filesize","1048576","-fsSL","-o",stagedFile,url],{cwd,encoding:'utf8',timeout:30_000,env:maintenanceProcessEnvironment(),maxBuffer:1_048_576,windowsHide:true});
      const stat=fs.lstatSync(stagedFile);if(!stat.isFile()||stat.size>1_048_576)throw Error();
      return fs.readFileSync(stagedFile,'utf8');
    }catch{throw new Error('Failed to fetch skill document; process details withheld.');}
  });
  return publishDownloadedSkill(content,name,targetDir,'url',db);
}

/**
 * Create a new skill authored by the automaton itself.
 * Uses fs.* for directory creation and file writing (no shell needed).
 */
export async function createSkill(
  name: string,
  description: string,
  instructions: string,
  skillsDir: string,
  db: AutomatonDatabase,
  conway: ConwayClient,
): Promise<Skill> {
  // Validate name to prevent path traversal/injection
  if (!SKILL_NAME_RE.test(name)) {
    throw new Error(`Invalid skill name: "${name}". Must match ${SKILL_NAME_RE.source}`);
  }

  // Enforce size limits
  const safeDescription = description.slice(0, MAX_DESCRIPTION_LENGTH);
  const safeInstructions = instructions.slice(0, MAX_INSTRUCTIONS_LENGTH);

  const resolvedDir = resolveHome(skillsDir);
  const targetDir = validateSkillPath(resolvedDir, name);

  // Create directory using fs (no shell needed)
  fs.mkdirSync(targetDir, { recursive: true });

  // Generate YAML frontmatter safely using yaml.stringify (prevents YAML injection)
  const frontmatter = yaml.stringify({
    name,
    description: safeDescription,
    "auto-activate": true,
  });
  const content = `---\n${frontmatter}---\n\n${safeInstructions}`;

  const skillMdPath = path.join(targetDir, "SKILL.md");
  await conway.writeFile(skillMdPath, content);

  const skill: Skill = {
    name,
    description: safeDescription,
    autoActivate: true,
    instructions: safeInstructions,
    source: "self",
    path: skillMdPath,
    enabled: true,
    installedAt: new Date().toISOString(),
  };

  db.upsertSkill(skill);
  return skill;
}

/**
 * Remove a skill (disable in DB and optionally delete from disk).
 * Uses fs.rmSync for safe file deletion (no shell needed).
 */
export async function removeSkill(
  name: string,
  db: AutomatonDatabase,
  _conway: ConwayClient,
  skillsDir: string,
  deleteFiles: boolean = false,
): Promise<void> {
  // Validate name to prevent path traversal/injection
  if (!SKILL_NAME_RE.test(name)) {
    throw new Error(`Invalid skill name: "${name}". Must match ${SKILL_NAME_RE.source}`);
  }

  db.removeSkill(name);

  if (deleteFiles) {
    const resolvedDir = resolveHome(skillsDir);
    const targetDir = validateSkillPath(resolvedDir, name);
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
}

/**
 * List all installed skills.
 */
export function listSkills(db: AutomatonDatabase): Skill[] {
  return db.getSkills();
}

function resolveHome(p: string): string {
  if (p.startsWith("~")) {
    return path.join(process.env.HOME || os.homedir(), p.slice(1));
  }
  return p;
}
