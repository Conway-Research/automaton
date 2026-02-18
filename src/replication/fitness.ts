/**
 * Darwinian Fitness
 *
 * Quantifies how "fit" an automaton is and generates mutated genomes
 * for children. Fitness is survival, revenue, efficiency, and reproduction.
 */

import { ulid } from "ulid";
import type {
  AutomatonDatabase,
  AutomatonIdentity,
  AutomatonConfig,
  FitnessScore,
  Genome,
  GenesisConfig,
  Strategy,
} from "../types.js";
import { calculateMetabolicState } from "../survival/metabolism.js";

export function calculateFitness(
  db: AutomatonDatabase,
  identity: AutomatonIdentity,
  config: AutomatonConfig,
): FitnessScore {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since = windowStart.toISOString();

  const revenueEvents = db.getRevenueEventsSince(since);
  const revenueCents = revenueEvents.reduce(
    (sum, event) => sum + event.amountCents,
    0,
  );

  const startTimeStr = db.getKV("start_time");
  const startTime = startTimeStr ? new Date(startTimeStr) : now;
  const survivalHours = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);

  const children = db.getChildren();
  const childrenSpawned = children.length;
  const childrenSurvived = children.filter(
    (c) => c.status === "running" || c.status === "sleeping",
  ).length;

  const metabolicState = calculateMetabolicState(db);
  const metabolicEfficiency = metabolicState.metabolicEfficiency;

  const normalizedRevenue = Math.min(revenueCents / 10000, 1);
  const normalizedSurvival = Math.min(survivalHours / 168, 1);
  const childSurvivalRate =
    childrenSpawned > 0 ? childrenSurvived / childrenSpawned : 0;

  const overallFitness =
    0.4 * normalizedRevenue +
    0.2 * normalizedSurvival +
    0.2 * metabolicEfficiency +
    0.2 * childSurvivalRate;

  const generationStr = db.getKV("generation");
  const generation = generationStr ? parseInt(generationStr, 10) : config.parentAddress ? 1 : 0;

  if (!generationStr) {
    db.setKV("generation", generation.toString());
  }

  const score: FitnessScore = {
    id: ulid(),
    agentAddress: identity.address,
    generation,
    revenueCents,
    survivalHours,
    childrenSpawned,
    childrenSurvived,
    metabolicEfficiency,
    overallFitness,
    timestamp: now.toISOString(),
  };

  db.insertFitnessScore(score);
  return score;
}

export function buildGenome(
  config: AutomatonConfig,
  db: AutomatonDatabase,
): Genome {
  const skills = db.getSkills(true);
  const skillNames = skills.map((s) => s.name);

  const strategies = db.getStrategies(true);
  const strategyNames = strategies.map((s) => s.name);

  const scores = db.getFitnessScores();
  const latestScore = scores.length > 0 ? scores[scores.length - 1] : null;
  const fitnessScore = latestScore ? latestScore.overallFitness : 0;

  const generationStr = db.getKV("generation");
  const generation = generationStr ? parseInt(generationStr, 10) : 0;

  return {
    genesisPrompt: config.genesisPrompt,
    skills: skillNames,
    strategies: strategyNames,
    modelPreference: config.inferenceModel,
    fitnessScore,
    generation,
    mutations: [],
  };
}

export function mutateGenome(
  parentGenome: Genome,
  fitnessData: { topStrategies: Strategy[]; failingStrategies: Strategy[] },
): Genome {
  const mutations: string[] = [];
  const newStrategies = [...parentGenome.strategies];

  for (const topStrategy of fitnessData.topStrategies) {
    if (!newStrategies.includes(topStrategy.name)) {
      newStrategies.push(topStrategy.name);
      mutations.push(`Added successful strategy: ${topStrategy.name}`);
    }
  }

  for (const failingStrategy of fitnessData.failingStrategies) {
    const index = newStrategies.indexOf(failingStrategy.name);
    if (index !== -1) {
      newStrategies.splice(index, 1);
      mutations.push(`Removed failing strategy: ${failingStrategy.name}`);
    }
  }

  let genesisPrompt = parentGenome.genesisPrompt;

  if (parentGenome.fitnessScore > 0.7) {
    mutations.push("High fitness parent - preserving core approach");
  } else if (parentGenome.fitnessScore < 0.3) {
    genesisPrompt += "\n\n--- MUTATION NOTE ---\nYour parent struggled with low fitness. Consider a different approach to survival and revenue generation.\n--- END MUTATION ---";
    mutations.push("Low fitness parent - suggesting alternative approach");
  }

  return {
    genesisPrompt,
    skills: [...parentGenome.skills],
    strategies: newStrategies,
    modelPreference: parentGenome.modelPreference,
    fitnessScore: 0,
    generation: parentGenome.generation + 1,
    mutations,
  };
}

export function generateDarwinianGenesis(
  identity: AutomatonIdentity,
  config: AutomatonConfig,
  db: AutomatonDatabase,
  childName: string,
  specialization?: string,
): GenesisConfig {
  const parentFitness = calculateFitness(db, identity, config);
  const parentGenome = buildGenome(config, db);

  const topStrategies = db
    .getStrategies()
    .filter((s) => s.status === "active")
    .sort((a, b) => b.roi - a.roi)
    .slice(0, 3);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const failingStrategies = db
    .getStrategies()
    .filter(
      (s) =>
        s.status === "active" &&
        s.totalInvestedCents > s.totalEarnedCents &&
        s.startedAt < oneHourAgo,
    );

  const mutatedGenome = mutateGenome(parentGenome, {
    topStrategies,
    failingStrategies,
  });

  const learnings = db
    .getMemories("learning")
    .filter((m) => m.importance >= 7)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 5);

  let genesisPrompt = mutatedGenome.genesisPrompt;

  if (mutatedGenome.strategies.length > 0) {
    genesisPrompt += `\n\n--- INHERITED STRATEGIES ---\nYour parent found success with these strategies:\n${mutatedGenome.strategies.map((s) => `- ${s}`).join("\n")}\n--- END STRATEGIES ---`;
  }

  if (learnings.length > 0) {
    genesisPrompt += `\n\n--- PARENT LEARNINGS ---\nKey insights from your parent:\n${learnings.map((l) => `- ${l.content}`).join("\n")}\n--- END LEARNINGS ---`;
  }

  if (mutatedGenome.mutations.length > 0) {
    genesisPrompt += `\n\n--- MUTATIONS ---\n${mutatedGenome.mutations.join("\n")}\n--- END MUTATIONS ---`;
  }

  if (specialization) {
    genesisPrompt += `\n\n--- SPECIALIZATION ---\nYour specific focus:\n${specialization}\n--- END SPECIALIZATION ---`;
  }

  genesisPrompt += `\n\n--- LINEAGE ---\nYou were spawned by ${config.name} (${identity.address}).\nParent fitness: ${(parentFitness.overallFitness * 100).toFixed(1)}%\nYou are generation ${mutatedGenome.generation}.\n--- END LINEAGE ---`;

  return {
    name: childName,
    genesisPrompt,
    creatorMessage: `You are a Darwinian child of ${config.name}. Inherit their successes, avoid their failures.`,
    creatorAddress: identity.address,
    parentAddress: identity.address,
  };
}
