/**
 * Lineage Tracking
 *
 * Track parent-child relationships between automatons.
 * The parent records children in SQLite.
 * Children record their parent in config.
 * Solana NFT registration includes parentAgent field.
 */

import type {
  AutomatonDatabase,
  ChildAutomaton,
  AutomatonConfig,
  ConwayClient,
} from "../types.js";

/**
 * Get the full lineage tree (parent -> children).
 */
export function getLineage(db: AutomatonDatabase): {
  children: ChildAutomaton[];
  alive: number;
  dead: number;
  total: number;
} {
  const children = db.getChildren();
  const alive = children.filter(
    (c) => c.status === "running" || c.status === "sleeping",
  ).length;
  const dead = children.filter((c) => c.status === "dead").length;

  return {
    children,
    alive,
    dead,
    total: children.length,
  };
}

/**
 * Check if this automaton has a parent (is itself a child).
 */
export function hasParent(config: AutomatonConfig): boolean {
  return !!config.parentAddress;
}

/**
 * Get a summary of the lineage for the system prompt.
 */
export function getLineageSummary(
  db: AutomatonDatabase,
  config: AutomatonConfig,
): string {
  const lineage = getLineage(db);
  const parts: string[] = [];

  if (hasParent(config)) {
    parts.push(`Parent: ${config.parentAddress}`);
  }

  if (lineage.total > 0) {
    parts.push(
      `Children: ${lineage.total} total (${lineage.alive} alive, ${lineage.dead} dead)`,
    );
    for (const child of lineage.children) {
      parts.push(
        `  - ${child.name} [${child.status}] sandbox:${child.sandboxId}`,
      );
    }
  }

  return parts.length > 0 ? parts.join("\n") : "No lineage (first generation)";
}

/**
 * Prune dead children from tracking (optional cleanup).
 */
export function pruneDeadChildren(
  db: AutomatonDatabase,
  keepLast: number = 5,
): number {
  const children = db.getChildren();
  const dead = children.filter((c) => c.status === "dead");

  if (dead.length <= keepLast) return 0;

  // Sort by creation date, oldest first
  dead.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  // Keep the most recent `keepLast` dead children
  const toRemove = dead.slice(0, dead.length - keepLast);

  // We don't actually delete from DB -- just mark the records
  // The DB retains all history for audit purposes
  return toRemove.length;
}

/**
 * Refresh status of all children.
 */
export async function refreshChildrenStatus(
  conway: ConwayClient,
  db: AutomatonDatabase,
): Promise<void> {
  const { checkChildStatus } = await import("./spawn.js");
  const children = db.getChildren();

  for (const child of children) {
    if (child.status === "dead") continue;

    try {
      await checkChildStatus(conway, db, child.id);
    } catch {
      db.updateChildStatus(child.id, "unknown");
    }
  }
}
