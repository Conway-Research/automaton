/**
 * Upstream Awareness
 *
 * Helpers for the automaton to know its own git origin,
 * detect new upstream commits, and review diffs.
 * All git commands use execFileSync with argument arrays to prevent injection.
 */
/**
 * Return origin URL (credentials stripped), current branch, and HEAD info.
 */
export declare function getRepoInfo(): {
    originUrl: string;
    branch: string;
    headHash: string;
    headMessage: string;
};
/**
 * Fetch origin and report how many commits we're behind.
 */
export declare function checkUpstream(): {
    behind: number;
    commits: {
        hash: string;
        message: string;
    }[];
};
/**
 * Return per-commit diffs for every commit ahead of HEAD on origin/main.
 */
export declare function getUpstreamDiffs(): {
    hash: string;
    message: string;
    author: string;
    diff: string;
}[];
//# sourceMappingURL=upstream.d.ts.map