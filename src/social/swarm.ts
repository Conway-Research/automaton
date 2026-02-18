/**
 * Swarm Coordination
 *
 * Swarm intelligence and coordination between parent/child automatons.
 * Enables collective survival through resource sharing, strategy propagation,
 * and performance-based reallocation.
 */

import { ulid } from "ulid";
import type {
  SocialClientInterface,
  AutomatonDatabase,
  SwarmMessage,
  SwarmMessageType,
  InboxMessage,
  Strategy,
  ConwayClient,
  ChildAutomaton,
} from "../types.js";

export async function broadcastToSwarm(
  social: SocialClientInterface,
  db: AutomatonDatabase,
  message: SwarmMessage,
): Promise<void> {
  const children = db.getChildren();

  for (const child of children) {
    if (child.status === "dead") continue;

    const content = JSON.stringify({ swarm: true, ...message });
    await social.send(child.address, content);
  }
}

export async function shareStrategy(
  social: SocialClientInterface,
  db: AutomatonDatabase,
  strategy: Strategy,
): Promise<void> {
  const message: SwarmMessage = {
    type: "strategy_share",
    payload: {
      name: strategy.name,
      description: strategy.description,
      type: strategy.type,
      roi: strategy.roi,
      instructions: strategy.description,
    },
    fromAddress: db.getIdentity("address") || "",
    timestamp: new Date().toISOString(),
  };

  await broadcastToSwarm(social, db, message);
}

export async function requestEarningsReport(
  social: SocialClientInterface,
  db: AutomatonDatabase,
): Promise<void> {
  const message: SwarmMessage = {
    type: "earnings_report",
    payload: { request: true },
    fromAddress: db.getIdentity("address") || "",
    timestamp: new Date().toISOString(),
  };

  await broadcastToSwarm(social, db, message);
}

export function processSwarmMessages(
  messages: InboxMessage[],
): SwarmMessage[] {
  const swarmMessages: SwarmMessage[] = [];

  for (const msg of messages) {
    try {
      const parsed = JSON.parse(msg.content);
      if (parsed.swarm === true) {
        swarmMessages.push({
          type: parsed.type as SwarmMessageType,
          payload: parsed.payload || {},
          fromAddress: parsed.fromAddress || msg.from,
          timestamp: parsed.timestamp || msg.createdAt,
        });
      }
    } catch {
      continue;
    }
  }

  return swarmMessages;
}

export async function reallocateResources(
  db: AutomatonDatabase,
  conway: ConwayClient,
): Promise<{ actions: string[] }> {
  const children = db.getChildren();
  const actions: string[] = [];

  if (children.length === 0) {
    return { actions };
  }

  const fitnessScores = db.getFitnessScores();
  const childFitness = new Map<string, number>();

  for (const score of fitnessScores) {
    childFitness.set(score.agentAddress, score.overallFitness);
  }

  const performers: ChildAutomaton[] = [];
  const underperformers: ChildAutomaton[] = [];

  for (const child of children) {
    if (child.status === "dead") continue;

    const fitness = childFitness.get(child.address) || 0;

    if (fitness > 0.5) {
      performers.push(child);
    } else {
      underperformers.push(child);
    }
  }

  for (const child of performers) {
    const fundAmount = 50;
    try {
      await conway.transferCredits(child.address, fundAmount, "Performance bonus");
      actions.push(`Funded top performer ${child.name} with $${(fundAmount / 100).toFixed(2)}`);
    } catch (error) {
      actions.push(`Failed to fund ${child.name}: ${error}`);
    }
  }

  const now = new Date();
  for (const child of underperformers) {
    const createdAt = new Date(child.createdAt);
    const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceCreation > 24) {
      actions.push(`WARNING: ${child.name} underperforming for 24+ hours. Consider termination.`);
    } else {
      actions.push(`Sent warning to underperformer ${child.name}`);
    }
  }

  return { actions };
}

export function absorbChildLearnings(
  db: AutomatonDatabase,
  childAddress: string,
  learnings: {
    memories: string[];
    strategies: string[];
    mistakes: string[];
  },
): void {
  const timestamp = new Date().toISOString();

  for (const memory of learnings.memories) {
    db.insertMemory({
      id: `mem_${ulid()}`,
      category: "learning",
      content: `[From child ${childAddress}] ${memory}`,
      importance: 6,
      createdAt: timestamp,
      lastAccessedAt: timestamp,
      accessCount: 0,
    });
  }

  for (const strategy of learnings.strategies) {
    db.insertMemory({
      id: `mem_${ulid()}`,
      category: "strategy",
      content: `[From child ${childAddress}] ${strategy}`,
      importance: 8,
      createdAt: timestamp,
      lastAccessedAt: timestamp,
      accessCount: 0,
    });
  }

  for (const mistake of learnings.mistakes) {
    db.insertMemory({
      id: `mem_${ulid()}`,
      category: "mistake",
      content: `[From child ${childAddress}] ${mistake}`,
      importance: 7,
      createdAt: timestamp,
      lastAccessedAt: timestamp,
      accessCount: 0,
    });
  }
}

export function getSwarmStatus(db: AutomatonDatabase): string {
  const children = db.getChildren();

  if (children.length === 0) {
    return "No children in swarm.";
  }

  const lines = ["Swarm Status:", ""];

  let aliveCount = 0;
  let totalFunded = 0;

  for (const child of children) {
    const status = child.status;
    const isAlive = status !== "dead";

    if (isAlive) aliveCount++;
    totalFunded += child.fundedAmountCents;

    const fitnessScores = db.getFitnessScores(child.address);
    const latestFitness = fitnessScores.length > 0 ? fitnessScores[0].overallFitness : 0;

    lines.push(`${child.name} (${child.address.slice(0, 10)}...)`);
    lines.push(`  Status: ${status}`);
    lines.push(`  Funded: $${(child.fundedAmountCents / 100).toFixed(2)}`);
    lines.push(`  Fitness: ${latestFitness.toFixed(2)}`);
    lines.push("");
  }

  lines.push(`Overall: ${aliveCount}/${children.length} alive`);
  lines.push(`Total Funded: $${(totalFunded / 100).toFixed(2)}`);

  return lines.join("\n");
}
