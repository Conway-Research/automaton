/**
 * Tools Manager
 *
 * Manages installation and configuration of external tools and MCP servers.
 */
import { logModification } from "./audit-log.js";
import { ulid } from "ulid";
/**
 * Install an npm package globally in the sandbox.
 */
export async function installNpmPackage(conway, db, packageName) {
    // Sanitize package name (prevent command injection)
    if (!/^[@a-zA-Z0-9._/-]+$/.test(packageName)) {
        return {
            success: false,
            error: `Invalid package name: ${packageName}`,
        };
    }
    const result = await conway.exec(`npm install -g ${packageName}`, 120000);
    if (result.exitCode !== 0) {
        return {
            success: false,
            error: `npm install failed: ${result.stderr}`,
        };
    }
    // Record in database
    const tool = {
        id: ulid(),
        name: packageName,
        type: "custom",
        config: { source: "npm", installCommand: `npm install -g ${packageName}` },
        installedAt: new Date().toISOString(),
        enabled: true,
    };
    db.installTool(tool);
    logModification(db, "tool_install", `Installed npm package: ${packageName}`, {
        reversible: true,
    });
    return { success: true };
}
/**
 * Install an MCP server.
 * The automaton can add new capabilities by installing MCP servers.
 */
export async function installMcpServer(conway, db, name, command, args, env) {
    // Record in database
    const tool = {
        id: ulid(),
        name: `mcp:${name}`,
        type: "mcp",
        config: { command, args, env },
        installedAt: new Date().toISOString(),
        enabled: true,
    };
    db.installTool(tool);
    logModification(db, "mcp_install", `Installed MCP server: ${name} (${command})`, { reversible: true });
    return { success: true };
}
/**
 * List all installed tools.
 */
export function listInstalledTools(db) {
    return db.getInstalledTools();
}
/**
 * Remove (disable) an installed tool.
 */
export function removeTool(db, toolId) {
    db.removeTool(toolId);
    logModification(db, "tool_install", `Removed tool: ${toolId}`, {
        reversible: true,
    });
}
//# sourceMappingURL=tools-manager.js.map