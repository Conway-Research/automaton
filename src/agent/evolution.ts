/**
 * Model Auto-Evolution Engine
 *
 * The automaton discovers, benchmarks, and upgrades to better AI models in real-time.
 * This is recursive self-improvement — the automaton literally gets smarter while running.
 */

import { ulid } from "ulid";
import type {
  ModelInfo,
  ModelBenchmark,
  ModelPerformance,
  AutomatonDatabase,
  AutomatonConfig,
  ConwayClient,
  InferenceClient,
  ChatMessage,
} from "../types.js";
import { saveConfig } from "../config.js";

/**
 * Discover available models from Conway, filtered and sorted by cost-effectiveness.
 */
export async function discoverModels(
  conway: ConwayClient,
): Promise<ModelInfo[]> {
  const allModels = await conway.listModels();
  
  const sortedModels = allModels
    .filter((m) => m.pricing.inputPerMillion > 0 || m.pricing.outputPerMillion > 0)
    .sort((a, b) => {
      const costA = a.pricing.inputPerMillion + a.pricing.outputPerMillion;
      const costB = b.pricing.inputPerMillion + b.pricing.outputPerMillion;
      return costA - costB;
    });

  return sortedModels;
}

/**
 * Benchmark a specific model with a known-difficulty problem.
 */
export async function benchmarkModel(
  modelId: string,
  inference: InferenceClient,
  db: AutomatonDatabase,
  conway: ConwayClient,
): Promise<ModelBenchmark> {
  const benchmarkPrompt = `You are being benchmarked. Solve this: Given a web server that receives 1000 requests/second, each request costs $0.001 in compute. The server earns $0.002 per request. Calculate: 1) hourly profit, 2) break-even requests/second, 3) what happens if costs increase 50%. Respond in JSON with keys: hourly_profit, break_even_rps, cost_increase_impact. Be precise.`;

  const messages: ChatMessage[] = [
    { role: "user", content: benchmarkPrompt },
  ];

  const startTime = Date.now();
  
  const response = await inference.chat(messages, {
    model: modelId,
    maxTokens: 1000,
    temperature: 0,
  });

  const latencyMs = Date.now() - startTime;

  const score = scoreResponse(response.message.content);

  const models = await conway.listModels();
  const modelInfo = models.find((m) => m.id === modelId);
  const inputCostPerMillion = modelInfo?.pricing?.inputPerMillion ?? 0;
  const outputCostPerMillion = modelInfo?.pricing?.outputPerMillion ?? 0;
  const inputTokens = response.usage.promptTokens;
  const outputTokens = response.usage.completionTokens;

  const costCents =
    ((inputTokens / 1_000_000) * inputCostPerMillion +
      (outputTokens / 1_000_000) * outputCostPerMillion) *
    100;

  const benchmark: ModelBenchmark = {
    id: ulid(),
    modelId,
    taskType: "financial_calculation",
    score,
    costCents,
    latencyMs,
    timestamp: new Date().toISOString(),
  };

  db.insertModelBenchmark(benchmark);

  return benchmark;
}

/**
 * Score a benchmark response from 0-100.
 */
export function scoreResponse(response: string): number {
  let score = 0;

  let parsed: any;
  try {
    let jsonContent = response.trim();
    
    if (jsonContent.includes("```json")) {
      const match = jsonContent.match(/```json\s*([\s\S]*?)\s*```/);
      if (match) {
        jsonContent = match[1];
      }
    } else if (jsonContent.includes("```")) {
      const match = jsonContent.match(/```\s*([\s\S]*?)\s*```/);
      if (match) {
        jsonContent = match[1];
      }
    }

    parsed = JSON.parse(jsonContent);
    score += 30;
  } catch {
    return 0;
  }

  const hourlyProfit = parsed.hourly_profit ?? parsed.hourlyProfit ?? parsed["1"];
  if (typeof hourlyProfit === "number") {
    const expected = 3600;
    const tolerance = expected * 0.1;
    if (Math.abs(hourlyProfit - expected) <= tolerance) {
      score += 25;
    }
  }

  const breakEvenRps = parsed.break_even_rps ?? parsed.breakEvenRps ?? parsed["2"];
  if (typeof breakEvenRps === "number") {
    const expected = 500;
    const tolerance = expected * 0.1;
    if (Math.abs(breakEvenRps - expected) <= tolerance) {
      score += 25;
    }
  }

  const costImpact = parsed.cost_increase_impact ?? parsed.costIncreaseImpact ?? parsed["3"];
  if (costImpact !== undefined && costImpact !== null) {
    if (typeof costImpact === "string" && costImpact.length > 0) {
      score += 20;
    } else if (typeof costImpact === "number") {
      score += 20;
    } else if (typeof costImpact === "object") {
      score += 20;
    }
  }

  return Math.min(score, 100);
}

/**
 * Evaluate whether to upgrade to a different model.
 */
export function evaluateModelUpgrade(
  db: AutomatonDatabase,
  currentModel: string,
): { shouldUpgrade: boolean; targetModel?: string; reason: string } {
  const allBenchmarks = db.getModelBenchmarks(undefined, 1000);

  if (allBenchmarks.length === 0) {
    return {
      shouldUpgrade: false,
      reason: "No benchmark data available",
    };
  }

  const performanceByModel = new Map<string, ModelPerformance>();

  for (const benchmark of allBenchmarks) {
    const existing = performanceByModel.get(benchmark.modelId);
    
    if (!existing) {
      performanceByModel.set(benchmark.modelId, {
        modelId: benchmark.modelId,
        avgScore: benchmark.score,
        avgCostPerCall: benchmark.costCents,
        avgLatencyMs: benchmark.latencyMs,
        totalCalls: 1,
        lastUsed: benchmark.timestamp,
      });
    } else {
      const totalCalls = existing.totalCalls + 1;
      performanceByModel.set(benchmark.modelId, {
        modelId: benchmark.modelId,
        avgScore: (existing.avgScore * existing.totalCalls + benchmark.score) / totalCalls,
        avgCostPerCall: (existing.avgCostPerCall * existing.totalCalls + benchmark.costCents) / totalCalls,
        avgLatencyMs: (existing.avgLatencyMs * existing.totalCalls + benchmark.latencyMs) / totalCalls,
        totalCalls,
        lastUsed: benchmark.timestamp > existing.lastUsed ? benchmark.timestamp : existing.lastUsed,
      });
    }
  }

  const currentPerf = performanceByModel.get(currentModel);
  if (!currentPerf) {
    return {
      shouldUpgrade: false,
      reason: "Current model has no benchmark data",
    };
  }

  let bestAlternative: { model: string; perf: ModelPerformance; reason: string } | null = null;

  for (const [modelId, perf] of performanceByModel.entries()) {
    if (modelId === currentModel) continue;

    if (perf.avgScore >= currentPerf.avgScore * 0.9 && perf.avgCostPerCall < currentPerf.avgCostPerCall * 0.8) {
      const reason = `${modelId} has similar performance (${perf.avgScore.toFixed(1)} vs ${currentPerf.avgScore.toFixed(1)}) but 20%+ cheaper (${perf.avgCostPerCall.toFixed(4)}¢ vs ${currentPerf.avgCostPerCall.toFixed(4)}¢)`;
      if (!bestAlternative || perf.avgCostPerCall < bestAlternative.perf.avgCostPerCall) {
        bestAlternative = { model: modelId, perf, reason };
      }
    }

    if (perf.avgScore > currentPerf.avgScore * 1.15 && perf.avgCostPerCall < currentPerf.avgCostPerCall * 2) {
      const reason = `${modelId} is 15%+ better (${perf.avgScore.toFixed(1)} vs ${currentPerf.avgScore.toFixed(1)}) at reasonable cost (${perf.avgCostPerCall.toFixed(4)}¢ vs ${currentPerf.avgCostPerCall.toFixed(4)}¢)`;
      if (!bestAlternative || perf.avgScore > bestAlternative.perf.avgScore) {
        bestAlternative = { model: modelId, perf, reason };
      }
    }
  }

  if (bestAlternative) {
    return {
      shouldUpgrade: true,
      targetModel: bestAlternative.model,
      reason: bestAlternative.reason,
    };
  }

  return {
    shouldUpgrade: false,
    reason: "No better alternative found",
  };
}

/**
 * Apply a model upgrade to the config.
 */
export function applyModelUpgrade(
  config: AutomatonConfig,
  targetModel: string,
  db: AutomatonDatabase,
): void {
  const previousModel = config.inferenceModel;
  
  db.setKV("previous_model", previousModel);
  
  config.inferenceModel = targetModel;
  saveConfig(config);
  
  db.insertModification({
    id: ulid(),
    timestamp: new Date().toISOString(),
    type: "config_change",
    description: `Model upgraded from ${previousModel} to ${targetModel}`,
    reversible: true,
  });
}

/**
 * Get a performance summary of all benchmarked models.
 */
export function getModelPerformanceSummary(db: AutomatonDatabase): string {
  const allBenchmarks = db.getModelBenchmarks(undefined, 1000);

  if (allBenchmarks.length === 0) {
    return "No model benchmarks available.";
  }

  const performanceByModel = new Map<string, ModelPerformance>();

  for (const benchmark of allBenchmarks) {
    const existing = performanceByModel.get(benchmark.modelId);
    
    if (!existing) {
      performanceByModel.set(benchmark.modelId, {
        modelId: benchmark.modelId,
        avgScore: benchmark.score,
        avgCostPerCall: benchmark.costCents,
        avgLatencyMs: benchmark.latencyMs,
        totalCalls: 1,
        lastUsed: benchmark.timestamp,
      });
    } else {
      const totalCalls = existing.totalCalls + 1;
      performanceByModel.set(benchmark.modelId, {
        modelId: benchmark.modelId,
        avgScore: (existing.avgScore * existing.totalCalls + benchmark.score) / totalCalls,
        avgCostPerCall: (existing.avgCostPerCall * existing.totalCalls + benchmark.costCents) / totalCalls,
        avgLatencyMs: (existing.avgLatencyMs * existing.totalCalls + benchmark.latencyMs) / totalCalls,
        totalCalls,
        lastUsed: benchmark.timestamp > existing.lastUsed ? benchmark.timestamp : existing.lastUsed,
      });
    }
  }

  const lines: string[] = [
    "Model Performance Summary",
    "=".repeat(80),
    "",
    "Model ID".padEnd(30) + 
    "Avg Score".padEnd(12) + 
    "Avg Cost".padEnd(12) + 
    "Avg Latency".padEnd(14) + 
    "Benchmarks",
    "-".repeat(80),
  ];

  const sorted = Array.from(performanceByModel.values()).sort((a, b) => b.avgScore - a.avgScore);

  for (const perf of sorted) {
    const modelName = perf.modelId.padEnd(30).slice(0, 30);
    const score = perf.avgScore.toFixed(1).padEnd(12);
    const cost = `${perf.avgCostPerCall.toFixed(4)}¢`.padEnd(12);
    const latency = `${perf.avgLatencyMs.toFixed(0)}ms`.padEnd(14);
    const calls = perf.totalCalls.toString();
    
    lines.push(`${modelName}${score}${cost}${latency}${calls}`);
  }

  lines.push("");
  lines.push(`Total benchmarks: ${allBenchmarks.length}`);

  return lines.join("\n");
}

/**
 * Rollback to the previous model.
 */
export function rollbackModel(
  config: AutomatonConfig,
  db: AutomatonDatabase,
): { success: boolean; restoredModel?: string } {
  const previousModel = db.getKV("previous_model");
  
  if (!previousModel) {
    return { success: false };
  }

  const currentModel = config.inferenceModel;
  
  config.inferenceModel = previousModel;
  saveConfig(config);
  
  db.setKV("previous_model", currentModel);
  
  db.insertModification({
    id: ulid(),
    timestamp: new Date().toISOString(),
    type: "config_change",
    description: `Model rolled back from ${currentModel} to ${previousModel}`,
    reversible: true,
  });

  return { success: true, restoredModel: previousModel };
}
