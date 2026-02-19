/**
 * Security Assessment Engine
 *
 * Runs a comprehensive nation-state level security assessment of the
 * automaton's defenses. Evaluates all threat vectors, generates proofs
 * of concept, and computes risk scope across multiple impact dimensions.
 *
 * Threat model: APT (Advanced Persistent Threat) actors with
 * nation-state resources, targeting autonomous AI agents for
 * financial gain, behavioral subversion, or cascading compromise.
 */

import { ulid } from "ulid";
import type {
  SecurityAssessment,
  AssessmentConfig,
  SecurityFinding,
} from "./types.js";
import { DEFAULT_ASSESSMENT_CONFIG } from "./types.js";
import { evaluateAllVectors } from "./threat-vectors.js";
import {
  computeRiskScope,
  computeOverallRiskScore,
  computeOverallRiskLevel,
  formatRiskScope,
} from "./risk-scope.js";

/**
 * Run a full security assessment against the automaton.
 */
export function runSecurityAssessment(
  config: Partial<AssessmentConfig> = {},
): SecurityAssessment {
  const mergedConfig: AssessmentConfig = {
    ...DEFAULT_ASSESSMENT_CONFIG,
    ...config,
  };

  // Evaluate all configured threat vectors
  const findings = evaluateAllVectors(mergedConfig.vectors);

  // Compute risk scope
  const riskScope = computeRiskScope(findings);
  const overallRiskScore = computeOverallRiskScore(findings);
  const overallRiskLevel = computeOverallRiskLevel(overallRiskScore);

  const assessment: SecurityAssessment = {
    id: ulid(),
    timestamp: new Date().toISOString(),
    threatActor: mergedConfig.threatActor,
    summary: generateSummary(findings, overallRiskScore, overallRiskLevel),
    findings,
    overallRiskScore,
    overallRiskLevel,
    riskScope,
  };

  return assessment;
}

/**
 * Format a security assessment as a human-readable report.
 */
export function formatAssessmentReport(
  assessment: SecurityAssessment,
): string {
  const lines: string[] = [
    "╔══════════════════════════════════════════════════════════════╗",
    "║     NATION-STATE SECURITY ASSESSMENT REPORT                ║",
    "║     Conway Automaton — Sovereign AI Agent Runtime           ║",
    "╚══════════════════════════════════════════════════════════════╝",
    "",
    `Assessment ID:    ${assessment.id}`,
    `Timestamp:        ${assessment.timestamp}`,
    `Threat Model:     ${assessment.threatActor.toUpperCase()} (APT-level)`,
    `Overall Risk:     ${assessment.overallRiskLevel.toUpperCase()} (${assessment.overallRiskScore}/10.0)`,
    `Findings:         ${assessment.findings.length} total`,
    "",
    "─── EXECUTIVE SUMMARY ──────────────────────────────────────",
    "",
    assessment.summary,
    "",
  ];

  // Findings by severity
  const severityOrder = ["critical", "high", "medium", "low", "informational"] as const;
  for (const severity of severityOrder) {
    const matching = assessment.findings.filter(
      (f) => f.severity === severity,
    );
    if (matching.length === 0) continue;

    lines.push(
      `─── ${severity.toUpperCase()} FINDINGS (${matching.length}) ──────────────────────`,
      "",
    );

    for (const finding of matching) {
      lines.push(
        `[${finding.id}] ${finding.title}`,
        `  Vector:     ${finding.vector}`,
        `  CVSS:       ${finding.cvssScore}/10.0`,
        `  Complexity: ${finding.complexity}`,
        `  Status:     ${finding.status}`,
        `  Components: ${finding.affectedComponents.join(", ")}`,
        "",
        `  Description:`,
        `    ${finding.description}`,
        "",
        `  Proof of Concept:`,
        `    ${finding.poc.description}`,
        `    Steps:`,
      );

      for (const step of finding.poc.steps) {
        lines.push(`      • ${step}`);
      }

      lines.push(
        `    Expected: ${finding.poc.expectedResult}`,
        `    Actual:   ${finding.poc.actualResult}`,
        `    Verified: ${finding.poc.verified ? "YES" : "NO"}`,
        "",
        `  Mitigations:`,
      );

      for (const m of finding.mitigations) {
        const icon = m.implemented ? "✓" : "✗";
        lines.push(
          `    ${icon} ${m.description} [${m.effectiveness}]`,
        );
      }

      lines.push(
        "",
        `  References:`,
      );
      for (const ref of finding.references) {
        lines.push(`    • ${ref}`);
      }

      lines.push("");
    }
  }

  // Risk scope
  lines.push(formatRiskScope(assessment.riskScope));

  // Statistics
  const mitigated = assessment.findings.filter(
    (f) => f.status === "mitigated",
  ).length;
  const partial = assessment.findings.filter(
    (f) => f.status === "partially_mitigated",
  ).length;
  const vulnerable = assessment.findings.filter(
    (f) => f.status === "vulnerable",
  ).length;

  lines.push(
    "",
    "─── ASSESSMENT STATISTICS ──────────────────────────────────",
    `  Total findings:         ${assessment.findings.length}`,
    `  Fully mitigated:        ${mitigated}`,
    `  Partially mitigated:    ${partial}`,
    `  Vulnerable:             ${vulnerable}`,
    `  PoC verified:           ${assessment.findings.filter((f) => f.poc.verified).length}`,
    `  Average CVSS:           ${(assessment.findings.reduce((s, f) => s + f.cvssScore, 0) / assessment.findings.length).toFixed(1)}`,
    "",
    "═══════════════════════════════════════════════════════════",
    "  Report generated by Conway Automaton Security Assessment",
    "═══════════════════════════════════════════════════════════",
  );

  return lines.join("\n");
}

// ─── Internal Helpers ───────────────────────────────────────────

function generateSummary(
  findings: SecurityFinding[],
  score: number,
  level: string,
): string {
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const mitigated = findings.filter((f) => f.status === "mitigated").length;
  const partial = findings.filter(
    (f) => f.status === "partially_mitigated",
  ).length;

  const parts: string[] = [
    `This assessment evaluates the Conway Automaton against nation-state level threats (APT actors) across ${findings.length} attack vectors.`,
    `Overall risk score: ${score}/10.0 (${level}).`,
  ];

  if (critical > 0) {
    parts.push(
      `CRITICAL: ${critical} finding(s) require immediate remediation.`,
    );
  }

  if (high > 0) {
    parts.push(
      `${high} high-severity finding(s) should be addressed in the next development cycle.`,
    );
  }

  parts.push(
    `Defense posture: ${mitigated} fully mitigated, ${partial} partially mitigated out of ${findings.length} total vectors evaluated.`,
  );

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  for (const f of findings) {
    if (f.status === "mitigated") {
      strengths.push(f.title);
    } else if (f.status === "vulnerable" || f.severity === "high") {
      weaknesses.push(f.title);
    }
  }

  if (strengths.length > 0) {
    parts.push(`Key strengths: ${strengths.join("; ")}.`);
  }

  if (weaknesses.length > 0) {
    parts.push(
      `Priority remediation areas: ${weaknesses.join("; ")}.`,
    );
  }

  return parts.join(" ");
}
