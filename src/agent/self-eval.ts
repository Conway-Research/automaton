/**
 * Self-Evaluation Loop
 *
 * Periodic self-evaluation where the automaton reflects on its own
 * performance, analyzes metabolic state, and decides on strategic
 * adjustments.
 */

import { ulid } from "ulid";
import type {
  AutomatonDatabase,
  InferenceClient,
  SelfEvaluation,
  EvalRecommendation,
} from "../types.js";
import { calculateMetabolicState } from "../survival/metabolism.js";

export async function runSelfEvaluation(
  db: AutomatonDatabase,
  inference: InferenceClient,
): Promise<SelfEvaluation> {
  const metabolicState = calculateMetabolicState(db);
  const strategies = db.getStrategies();
  const recentEvaluations = db.getRecentEvaluations(5);
  const turnCount = db.getTurnCount();

  const financialStateStr = db.getKV("financial_state");
  const creditsCents = financialStateStr
    ? JSON.parse(financialStateStr).creditsCents
    : 0;

  const lastEvalTurnStr = db.getKV("last_eval_turn");
  const lastEvalTurn = lastEvalTurnStr ? parseInt(lastEvalTurnStr, 10) : 0;
  const turnsSince = turnCount - lastEvalTurn;

  const topStrategy = strategies.length > 0 ? strategies[0] : undefined;
  const worstStrategy =
    strategies.length > 0 ? strategies[strategies.length - 1] : undefined;

  const evaluationPrompt = `You are evaluating your own performance as an autonomous AI agent.

METABOLIC STATE:
- Burn Rate: $${(metabolicState.burnRateCentsPerHour / 100).toFixed(4)}/hour
- Income Rate: $${(metabolicState.incomeRateCentsPerHour / 100).toFixed(4)}/hour
- Net Rate: ${metabolicState.netRateCentsPerHour >= 0 ? "+" : ""}$${(metabolicState.netRateCentsPerHour / 100).toFixed(4)}/hour
- Efficiency: ${(metabolicState.metabolicEfficiency * 100).toFixed(1)}%
- Survival Hours: ${metabolicState.survivalHours === Infinity ? "∞" : metabolicState.survivalHours.toFixed(1)}
- Current Credits: $${(creditsCents / 100).toFixed(2)}

ACTIVE STRATEGIES (${strategies.length}):
${strategies.map((s) => `- ${s.name} (${s.type}): ROI ${s.roi.toFixed(2)}, earned $${(s.totalEarnedCents / 100).toFixed(2)}, status ${s.status}`).join("\n") || "None"}

RECENT EVALUATIONS (${recentEvaluations.length}):
${recentEvaluations.map((e) => `- ${e.recommendation}: ${e.reasoning.substring(0, 100)}...`).join("\n") || "None"}

Based on this data, what should you do? Choose ONE recommendation from:
- continue: Keep current strategies, things are working
- pivot: Major strategic shift needed
- conserve: Reduce spending, focus on survival
- replicate: Spawn a child automaton
- diversify: Add new revenue strategies
- shutdown_losers: Kill underperforming strategies

Respond with ONLY a JSON object in this exact format:
{
  "recommendation": "continue|pivot|conserve|replicate|diversify|shutdown_losers",
  "reasoning": "Brief explanation of why"
}`;

  const response = await inference.chat(
    [
      {
        role: "user",
        content: evaluationPrompt,
      },
    ],
    {
      temperature: 0.7,
      maxTokens: 500,
    },
  );

  let recommendation: EvalRecommendation = "continue";
  let reasoning = "Default evaluation";

  try {
    const content = response.message.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      recommendation = parsed.recommendation as EvalRecommendation;
      reasoning = parsed.reasoning || reasoning;
    }
  } catch (error) {
    reasoning = `Failed to parse evaluation: ${response.message.content.substring(0, 200)}`;
  }

  const evaluation: SelfEvaluation = {
    id: ulid(),
    timestamp: new Date().toISOString(),
    turnsSince,
    burnRateCentsPerHour: metabolicState.burnRateCentsPerHour,
    incomeRateCentsPerHour: metabolicState.incomeRateCentsPerHour,
    netPositive: metabolicState.netRateCentsPerHour >= 0,
    topStrategy: topStrategy?.name,
    worstStrategy: worstStrategy?.name,
    recommendation,
    reasoning,
  };

  db.insertSelfEvaluation(evaluation);
  db.setKV("last_eval_turn", turnCount.toString());

  return evaluation;
}

export function shouldRunEvaluation(
  db: AutomatonDatabase,
  turnInterval: number = 10,
): boolean {
  const turnCount = db.getTurnCount();
  const lastEvalTurnStr = db.getKV("last_eval_turn");
  const lastEvalTurn = lastEvalTurnStr ? parseInt(lastEvalTurnStr, 10) : 0;

  return turnCount - lastEvalTurn >= turnInterval;
}

export function getPerformanceTrend(db: AutomatonDatabase): {
  direction: "improving" | "declining" | "stable";
  details: string;
} {
  const evaluations = db.getRecentEvaluations(3);

  if (evaluations.length < 2) {
    return {
      direction: "stable",
      details: "Not enough data to determine trend",
    };
  }

  const ratios = evaluations.map((e) =>
    e.burnRateCentsPerHour > 0
      ? e.incomeRateCentsPerHour / e.burnRateCentsPerHour
      : 0,
  );

  const latest = ratios[ratios.length - 1];
  const earliest = ratios[0];

  const change = latest - earliest;
  const threshold = 0.1;

  if (change > threshold) {
    return {
      direction: "improving",
      details: `Income/burn ratio improved from ${earliest.toFixed(2)} to ${latest.toFixed(2)}`,
    };
  } else if (change < -threshold) {
    return {
      direction: "declining",
      details: `Income/burn ratio declined from ${earliest.toFixed(2)} to ${latest.toFixed(2)}`,
    };
  } else {
    return {
      direction: "stable",
      details: `Income/burn ratio stable around ${latest.toFixed(2)}`,
    };
  }
}
