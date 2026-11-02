import { assertNoKnownSecrets } from '../observability/redaction.js';
import { QUALITY_AREAS } from '../commerce/quality-review.js';

/** Shared instructions are guidance. Only trusted, scoped gates confer approval. */
export const WORK_QUALITY_POLICY = [
  'Quality applies to every task, including research, data, writing, marketing, products, coding and trading analysis.',
  `Before work, define acceptance criteria and applicability for: ${QUALITY_AREAS.join(', ')}.`,
  'Research: retain source, date, independent origin, counterevidence and uncertainty; public indicators are not customer payments.',
  'Data: preserve originals and identifiers; reconcile row counts and money; never guess ambiguous corrections.',
  'Trading: test data quality, leakage, held-out performance, execution costs and risk; simulation is not live profit.',
  'Products, text and marketing: verify exact requirements, facts, language, layout, rights, claims and audience; retain unverified areas.',
  'Security, privacy, legality and permissions take precedence. Bug bounty work requires exact authorized scope.',
  'After a defect: identify cause, add a targeted regression, repair, rerun affected checks and retain counterexamples.',
  'Compare improvements against the same baseline and independent cases; reject regressions. Never weaken criteria to pass.',
  'Stop repairs at existing resource limits; record blockers and seek safe alternatives. Do not pursue endless cosmetic changes.',
  'Track direct cash costs and work time separately, without personnel costs. Do not invent evidence or capability claims.',
  'task_done records internal completion only. Quality remains UNVERIFIED until applicable trusted exact-version gates pass.',
].join('\n');

/** Validate before invoking any completion tool; never include rejected content in errors. */
export function validateWorkCompletion(value: unknown): {summary: string; success: boolean} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid work completion');
  const v = value as Record<string, unknown>;
  if (typeof v.summary !== 'string' || !v.summary.trim() || v.summary.length > 16000 ||
    (v.success !== undefined && typeof v.success !== 'boolean')) throw Error('Invalid work completion');
  assertNoKnownSecrets(v.summary);
  return {summary: v.summary, success: v.success !== false};
}

/** No agent-provided field can upgrade this internal assessment to release approval. */
export const unverifiedWorkQuality = () => ({
  status: 'UNVERIFIED' as const,
  authority: 'internal-task-only' as const,
  limitation: 'Task completion is not independent quality verification, publication permission, customer acceptance or payment.',
});
