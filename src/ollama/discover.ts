/**
 * Ollama Model Discovery
 *
 * Fetches available models from a local Ollama instance and registers
 * them in the model registry so they can be used for inference.
 */

import type BetterSqlite3 from "better-sqlite3";
import { modelRegistryUpsert, modelRegistryGet } from "../state/database.js";
import type { ModelRegistryRow } from "../types.js";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("ollama");

interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    family?: string;
  };
}

interface OllamaTagsResponse {
  models: OllamaModel[];
}

/**
 * Fetch all available models from Ollama's /api/tags endpoint
 * and upsert them into the model registry.
 *
 * Returns the list of discovered model IDs, or an empty array if
 * Ollama is unreachable (treated as a soft failure).
 */
export async function discoverOllamaModels(
  baseUrl: string,
  db: BetterSqlite3.Database,
): Promise<string[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/tags`;

  let data: OllamaTagsResponse;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!resp.ok) {
      logger.warn(`Ollama /api/tags returned ${resp.status} — skipping discovery`);
      return [];
    }
    data = await resp.json() as OllamaTagsResponse;
  } catch (err: any) {
    logger.warn(`Ollama not reachable at ${baseUrl}: ${err.message}`);
    return [];
  }

  if (!Array.isArray(data.models)) {
    logger.warn("Ollama /api/tags response has no models array");
    return [];
  }

  const now = new Date().toISOString();
  const registered: string[] = [];

  for (const m of data.models) {
    const modelId = m.name || m.model;
    if (!modelId) continue;

    const existing = modelRegistryGet(db, modelId);
    const row: ModelRegistryRow = {
      modelId,
      provider: "ollama",
      displayName: formatDisplayName(modelId),
      // Ollama models are local — no cost
      tierMinimum: existing?.tierMinimum ?? "critical",
      costPer1kInput: 0,
      costPer1kOutput: 0,
      maxTokens: existing?.maxTokens ?? 4096,
      contextWindow: existing?.contextWindow ?? 8192,
      // Most modern Ollama models support tools; default true
      supportsTools: existing?.supportsTools ?? true,
      supportsVision: existing?.supportsVision ?? false,
      parameterStyle: "max_tokens",
      enabled: existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    modelRegistryUpsert(db, row);
    registered.push(modelId);
  }

  if (registered.length > 0) {
    logger.info(`Ollama: registered ${registered.length} model(s): ${registered.join(", ")}`);
  }

  return registered;
}

function formatDisplayName(modelId: string): string {
  // "llama3.2:latest" → "Llama 3.2 (latest)"
  const [name, tag] = modelId.split(":");
  const pretty = name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return tag && tag !== "latest" ? `${pretty} (${tag})` : pretty;
}
