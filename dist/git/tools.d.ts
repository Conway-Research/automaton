/**
 * Git Tools
 *
 * Built-in git operations for the automaton.
 * Used for both state versioning and code development.
 */
import type { ConwayClient, GitStatus, GitLogEntry } from "../types.js";
/**
 * Get git status for a repository.
 */
export declare function gitStatus(conway: ConwayClient, repoPath: string): Promise<GitStatus>;
/**
 * Get git diff output.
 */
export declare function gitDiff(conway: ConwayClient, repoPath: string, staged?: boolean): Promise<string>;
/**
 * Create a git commit.
 */
export declare function gitCommit(conway: ConwayClient, repoPath: string, message: string, addAll?: boolean): Promise<string>;
/**
 * Get git log.
 */
export declare function gitLog(conway: ConwayClient, repoPath: string, limit?: number): Promise<GitLogEntry[]>;
/**
 * Push to remote.
 */
export declare function gitPush(conway: ConwayClient, repoPath: string, remote?: string, branch?: string): Promise<string>;
/**
 * Manage branches.
 */
export declare function gitBranch(conway: ConwayClient, repoPath: string, action: "list" | "create" | "checkout" | "delete", branchName?: string): Promise<string>;
/**
 * Clone a repository.
 */
export declare function gitClone(conway: ConwayClient, url: string, targetPath: string, depth?: number): Promise<string>;
/**
 * Initialize a git repository.
 */
export declare function gitInit(conway: ConwayClient, repoPath: string): Promise<string>;
//# sourceMappingURL=tools.d.ts.map