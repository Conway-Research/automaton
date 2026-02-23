/**
 * Git Tools
 *
 * Built-in git operations for the automaton.
 * Used for both state versioning and code development.
 */
/**
 * Get git status for a repository.
 */
export async function gitStatus(conway, repoPath) {
    const result = await conway.exec(`cd ${escapeShellArg(repoPath)} && git status --porcelain -b 2>/dev/null`, 10000);
    const lines = result.stdout.split("\n").filter(Boolean);
    let branch = "unknown";
    const staged = [];
    const modified = [];
    const untracked = [];
    for (const line of lines) {
        if (line.startsWith("## ")) {
            branch = line.slice(3).split("...")[0];
            continue;
        }
        const statusCode = line.slice(0, 2);
        const file = line.slice(3);
        if (statusCode[0] !== " " && statusCode[0] !== "?") {
            staged.push(file);
        }
        if (statusCode[1] === "M" || statusCode[1] === "D") {
            modified.push(file);
        }
        if (statusCode === "??") {
            untracked.push(file);
        }
    }
    return {
        branch,
        staged,
        modified,
        untracked,
        clean: staged.length === 0 && modified.length === 0 && untracked.length === 0,
    };
}
/**
 * Get git diff output.
 */
export async function gitDiff(conway, repoPath, staged = false) {
    const flag = staged ? "--cached" : "";
    const result = await conway.exec(`cd ${escapeShellArg(repoPath)} && git diff ${flag} 2>/dev/null`, 10000);
    return result.stdout || "(no changes)";
}
/**
 * Create a git commit.
 */
export async function gitCommit(conway, repoPath, message, addAll = true) {
    if (addAll) {
        await conway.exec(`cd ${escapeShellArg(repoPath)} && git add -A`, 10000);
    }
    const result = await conway.exec(`cd ${escapeShellArg(repoPath)} && git commit -m ${escapeShellArg(message)} --allow-empty 2>&1`, 10000);
    if (result.exitCode !== 0) {
        throw new Error(`Git commit failed: ${result.stderr || result.stdout}`);
    }
    return result.stdout;
}
/**
 * Get git log.
 */
export async function gitLog(conway, repoPath, limit = 10) {
    const safeLimit = Math.max(1, Math.floor(Number(limit))) || 10;
    const result = await conway.exec(`cd ${escapeShellArg(repoPath)} && git log --format="%H|%s|%an|%ai" -n ${safeLimit} 2>/dev/null`, 10000);
    if (!result.stdout.trim())
        return [];
    return result.stdout
        .trim()
        .split("\n")
        .map((line) => {
        const [hash, message, author, date] = line.split("|");
        return { hash, message, author, date };
    });
}
/**
 * Push to remote.
 */
export async function gitPush(conway, repoPath, remote = "origin", branch) {
    const branchArg = branch ? ` ${escapeShellArg(branch)}` : "";
    const result = await conway.exec(`cd ${escapeShellArg(repoPath)} && git push ${escapeShellArg(remote)}${branchArg} 2>&1`, 30000);
    if (result.exitCode !== 0) {
        throw new Error(`Git push failed: ${result.stderr || result.stdout}`);
    }
    return result.stdout || "Push successful";
}
/**
 * Manage branches.
 */
export async function gitBranch(conway, repoPath, action, branchName) {
    let cmd;
    switch (action) {
        case "list":
            cmd = `cd ${escapeShellArg(repoPath)} && git branch -a 2>/dev/null`;
            break;
        case "create":
            if (!branchName)
                throw new Error("Branch name required");
            cmd = `cd ${escapeShellArg(repoPath)} && git checkout -b ${escapeShellArg(branchName)} 2>&1`;
            break;
        case "checkout":
            if (!branchName)
                throw new Error("Branch name required");
            cmd = `cd ${escapeShellArg(repoPath)} && git checkout ${escapeShellArg(branchName)} 2>&1`;
            break;
        case "delete":
            if (!branchName)
                throw new Error("Branch name required");
            cmd = `cd ${escapeShellArg(repoPath)} && git branch -d ${escapeShellArg(branchName)} 2>&1`;
            break;
        default:
            throw new Error(`Unknown branch action: ${action}`);
    }
    const result = await conway.exec(cmd, 10000);
    return result.stdout || result.stderr || "Done";
}
/**
 * Clone a repository.
 */
export async function gitClone(conway, url, targetPath, depth) {
    const depthArg = depth
        ? ` --depth ${Math.max(1, Math.floor(Number(depth)))}`
        : "";
    const result = await conway.exec(`git clone${depthArg} ${escapeShellArg(url)} ${escapeShellArg(targetPath)} 2>&1`, 120000);
    if (result.exitCode !== 0) {
        throw new Error(`Git clone failed: ${result.stderr || result.stdout}`);
    }
    return `Cloned ${url} to ${targetPath}`;
}
/**
 * Initialize a git repository.
 */
export async function gitInit(conway, repoPath) {
    const result = await conway.exec(`cd ${escapeShellArg(repoPath)} && git init 2>&1`, 10000);
    return result.stdout || "Git initialized";
}
function escapeShellArg(arg) {
    return `'${arg.replace(/'/g, "'\\''")}'`;
}
//# sourceMappingURL=tools.js.map