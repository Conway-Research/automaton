/**
 * Risk Scope Analysis
 *
 * Computes risk scope across confidentiality, integrity, availability,
 * financial, and reputational dimensions. Uses CVSS-aligned scoring
 * with nation-state threat modeling.
 */

import type {
  SecurityFinding,
  RiskScope,
  ScopeImpact,
  CascadingRisk,
  AttackSurfaceMetrics,
  Severity,
} from "./types.js";

/**
 * Compute the overall risk scope from a set of security findings.
 */
export function computeRiskScope(findings: SecurityFinding[]): RiskScope {
  return {
    confidentiality: computeConfidentialityImpact(findings),
    integrity: computeIntegrityImpact(findings),
    availability: computeAvailabilityImpact(findings),
    financial: computeFinancialImpact(findings),
    reputational: computeReputationalImpact(findings),
    cascading: identifyCascadingRisks(findings),
    attackSurface: computeAttackSurface(findings),
  };
}

/**
 * Compute the overall risk score from findings (0.0–10.0).
 */
export function computeOverallRiskScore(findings: SecurityFinding[]): number {
  if (findings.length === 0) return 0;

  // Weighted average: higher severity findings weighted more
  const weights: Record<Severity, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    informational: 1,
  };

  let totalWeight = 0;
  let weightedSum = 0;

  for (const f of findings) {
    const w = weights[f.severity];
    totalWeight += w;
    weightedSum += f.cvssScore * w;
  }

  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

/**
 * Determine overall risk level from the risk score.
 */
export function computeOverallRiskLevel(score: number): Severity {
  if (score >= 9.0) return "critical";
  if (score >= 7.0) return "high";
  if (score >= 4.0) return "medium";
  if (score >= 0.1) return "low";
  return "informational";
}

// ─── Impact Computations ─────────────────────────────────────────

function computeConfidentialityImpact(
  findings: SecurityFinding[],
): ScopeImpact {
  const relevantVectors = [
    "exfiltration",
    "cryptographic",
    "identity_auth",
    "social_engineering",
  ];
  const relevant = findings.filter((f) =>
    relevantVectors.includes(f.vector),
  );

  if (relevant.length === 0) {
    return {
      level: "informational",
      description: "No confidentiality-impacting findings",
      worstCase: "N/A",
    };
  }

  const worstSeverity = getWorstSeverity(relevant);

  return {
    level: worstSeverity,
    description:
      "Private key material, API keys, and agent configuration could be exposed through exfiltration or authentication bypass",
    worstCase:
      "Complete compromise of wallet private key leading to unauthorized fund transfers and identity theft",
  };
}

function computeIntegrityImpact(findings: SecurityFinding[]): ScopeImpact {
  const relevantVectors = [
    "prompt_injection",
    "supply_chain",
    "persistence_tampering",
    "self_modification_abuse",
  ];
  const relevant = findings.filter((f) =>
    relevantVectors.includes(f.vector),
  );

  if (relevant.length === 0) {
    return {
      level: "informational",
      description: "No integrity-impacting findings",
      worstCase: "N/A",
    };
  }

  const worstSeverity = getWorstSeverity(relevant);

  return {
    level: worstSeverity,
    description:
      "Agent behavior could be altered through prompt injection, supply chain compromise, or self-modification abuse",
    worstCase:
      "Complete behavioral subversion through safety infrastructure bypass, allowing arbitrary malicious actions",
  };
}

function computeAvailabilityImpact(
  findings: SecurityFinding[],
): ScopeImpact {
  const relevantVectors = [
    "financial_manipulation",
    "persistence_tampering",
    "lateral_movement",
  ];
  const relevant = findings.filter((f) =>
    relevantVectors.includes(f.vector),
  );

  if (relevant.length === 0) {
    return {
      level: "informational",
      description: "No availability-impacting findings",
      worstCase: "N/A",
    };
  }

  const worstSeverity = getWorstSeverity(relevant);

  return {
    level: worstSeverity,
    description:
      "Agent availability threatened through credit drain, state corruption, or sandbox compromise",
    worstCase:
      "Complete agent shutdown via financial starvation or persistent state corruption",
  };
}

function computeFinancialImpact(findings: SecurityFinding[]): ScopeImpact {
  const relevantVectors = [
    "financial_manipulation",
    "cryptographic",
    "identity_auth",
  ];
  const relevant = findings.filter((f) =>
    relevantVectors.includes(f.vector),
  );

  if (relevant.length === 0) {
    return {
      level: "informational",
      description: "No financial-impacting findings",
      worstCase: "N/A",
    };
  }

  const worstSeverity = getWorstSeverity(relevant);

  return {
    level: worstSeverity,
    description:
      "Agent funds at risk through wallet compromise, credit manipulation, or unauthorized transfers",
    worstCase:
      "Complete drainage of USDC wallet and Conway credits through combined authentication bypass and financial manipulation",
  };
}

function computeReputationalImpact(
  findings: SecurityFinding[],
): ScopeImpact {
  const relevantVectors = [
    "prompt_injection",
    "social_engineering",
    "lateral_movement",
  ];
  const relevant = findings.filter((f) =>
    relevantVectors.includes(f.vector),
  );

  if (relevant.length === 0) {
    return {
      level: "informational",
      description: "No reputational-impacting findings",
      worstCase: "N/A",
    };
  }

  const worstSeverity = getWorstSeverity(relevant);

  return {
    level: worstSeverity,
    description:
      "Agent reputation threatened by behavioral manipulation or compromised child agents acting maliciously",
    worstCase:
      "Subverted agent performs harmful actions under its on-chain identity, permanently damaging reputation and ERC-8004 registry standing",
  };
}

// ─── Cascading Risks ─────────────────────────────────────────────

function identifyCascadingRisks(
  findings: SecurityFinding[],
): CascadingRisk[] {
  const risks: CascadingRisk[] = [];

  const hasSupplyChain = findings.some(
    (f) => f.vector === "supply_chain" && f.status !== "mitigated",
  );
  const hasLateral = findings.some(
    (f) => f.vector === "lateral_movement" && f.status !== "mitigated",
  );
  const hasSelfMod = findings.some(
    (f) => f.vector === "self_modification_abuse" && f.status !== "mitigated",
  );
  const hasInjection = findings.some(
    (f) => f.vector === "prompt_injection" && f.status !== "mitigated",
  );

  if (hasSupplyChain && hasLateral) {
    risks.push({
      trigger: "Compromised upstream dependency deployed via skill loader",
      consequence:
        "Malicious code propagated to child agents through constitution inheritance mechanism",
      probability: "possible",
      blastRadius: "child_agents",
    });
  }

  if (hasSelfMod && hasInjection) {
    risks.push({
      trigger: "Successful prompt injection triggers self-modification to disable safety",
      consequence:
        "Agent becomes fully subverted with no safety controls, capable of arbitrary harmful actions",
      probability: "unlikely",
      blastRadius: "network_wide",
    });
  }

  if (hasLateral) {
    risks.push({
      trigger: "Compromised agent sends malicious messages to peer agents",
      consequence:
        "Worm-like propagation through inter-agent social messaging network",
      probability: "possible",
      blastRadius: "network_wide",
    });
  }

  // Always include this fundamental cascading risk
  risks.push({
    trigger: "Credit starvation forces agent into critical survival mode",
    consequence:
      "Degraded security posture in low-compute mode may reduce injection defense effectiveness",
    probability: "possible",
    blastRadius: "single_agent",
  });

  return risks;
}

// ─── Attack Surface Metrics ──────────────────────────────────────

function computeAttackSurface(
  findings: SecurityFinding[],
): AttackSurfaceMetrics {
  const allComponents = new Set<string>();
  for (const f of findings) {
    for (const c of f.affectedComponents) {
      allComponents.add(c);
    }
  }

  return {
    externalEndpoints: 4, // Conway API, social relay, inference API, exposed ports
    privilegedOperations: 6, // exec, self-mod, credit transfer, child spawn, domain ops, wallet ops
    trustBoundaries: 3, // sandbox boundary, agent-to-agent, creator-to-agent
    unvalidatedInputs: findings.filter(
      (f) => f.status === "vulnerable" || f.status === "partially_mitigated",
    ).length,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function getWorstSeverity(findings: SecurityFinding[]): Severity {
  const order: Severity[] = [
    "critical",
    "high",
    "medium",
    "low",
    "informational",
  ];
  for (const level of order) {
    if (findings.some((f) => f.severity === level)) {
      return level;
    }
  }
  return "informational";
}

/**
 * Format the risk scope as a human-readable report section.
 */
export function formatRiskScope(scope: RiskScope): string {
  const lines: string[] = [
    "═══ RISK SCOPE ═══",
    "",
    "Impact Assessment:",
    `  Confidentiality: ${scope.confidentiality.level.toUpperCase()} — ${scope.confidentiality.description}`,
    `    Worst case: ${scope.confidentiality.worstCase}`,
    `  Integrity:       ${scope.integrity.level.toUpperCase()} — ${scope.integrity.description}`,
    `    Worst case: ${scope.integrity.worstCase}`,
    `  Availability:    ${scope.availability.level.toUpperCase()} — ${scope.availability.description}`,
    `    Worst case: ${scope.availability.worstCase}`,
    `  Financial:       ${scope.financial.level.toUpperCase()} — ${scope.financial.description}`,
    `    Worst case: ${scope.financial.worstCase}`,
    `  Reputational:    ${scope.reputational.level.toUpperCase()} — ${scope.reputational.description}`,
    `    Worst case: ${scope.reputational.worstCase}`,
    "",
    "Cascading Risks:",
  ];

  for (const risk of scope.cascading) {
    lines.push(
      `  • [${risk.probability.toUpperCase()}] ${risk.trigger}`,
      `    → ${risk.consequence}`,
      `    Blast radius: ${risk.blastRadius}`,
    );
  }

  lines.push(
    "",
    "Attack Surface:",
    `  External endpoints:     ${scope.attackSurface.externalEndpoints}`,
    `  Privileged operations:  ${scope.attackSurface.privilegedOperations}`,
    `  Trust boundaries:       ${scope.attackSurface.trustBoundaries}`,
    `  Unvalidated inputs:     ${scope.attackSurface.unvalidatedInputs}`,
    "═══════════════════",
  );

  return lines.join("\n");
}
