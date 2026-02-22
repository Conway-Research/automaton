/**
 * Security Assessment Types
 *
 * Type definitions for nation-state level security assessments
 * with proof-of-concept and risk scoping.
 */

// ─── Threat Model ────────────────────────────────────────────────

export type ThreatActor = "nation_state" | "organized_crime" | "insider" | "opportunistic";

export type AttackVector =
  | "prompt_injection"
  | "supply_chain"
  | "cryptographic"
  | "identity_auth"
  | "persistence_tampering"
  | "lateral_movement"
  | "exfiltration"
  | "financial_manipulation"
  | "self_modification_abuse"
  | "social_engineering";

export type Severity = "critical" | "high" | "medium" | "low" | "informational";

export type ExploitComplexity = "low" | "medium" | "high";

export type RiskStatus = "vulnerable" | "mitigated" | "partially_mitigated" | "not_applicable";

// ─── Assessment Results ──────────────────────────────────────────

export interface SecurityAssessment {
  id: string;
  timestamp: string;
  threatActor: ThreatActor;
  summary: string;
  findings: SecurityFinding[];
  overallRiskScore: number; // 0.0–10.0 (CVSS-aligned)
  overallRiskLevel: Severity;
  riskScope: RiskScope;
}

export interface SecurityFinding {
  id: string;
  vector: AttackVector;
  title: string;
  description: string;
  severity: Severity;
  cvssScore: number; // 0.0–10.0
  complexity: ExploitComplexity;
  status: RiskStatus;
  affectedComponents: string[];
  poc: ProofOfConcept;
  mitigations: Mitigation[];
  references: string[];
}

export interface ProofOfConcept {
  description: string;
  steps: string[];
  payload: string;
  expectedResult: string;
  actualResult: string;
  verified: boolean;
}

export interface Mitigation {
  description: string;
  implemented: boolean;
  effectiveness: "full" | "partial" | "none";
}

// ─── Risk Scope ──────────────────────────────────────────────────

export interface RiskScope {
  confidentiality: ScopeImpact;
  integrity: ScopeImpact;
  availability: ScopeImpact;
  financial: ScopeImpact;
  reputational: ScopeImpact;
  cascading: CascadingRisk[];
  attackSurface: AttackSurfaceMetrics;
}

export interface ScopeImpact {
  level: Severity;
  description: string;
  worstCase: string;
}

export interface CascadingRisk {
  trigger: string;
  consequence: string;
  probability: "likely" | "possible" | "unlikely";
  blastRadius: "single_agent" | "child_agents" | "network_wide";
}

export interface AttackSurfaceMetrics {
  externalEndpoints: number;
  privilegedOperations: number;
  trustBoundaries: number;
  unvalidatedInputs: number;
}

// ─── Assessment Configuration ────────────────────────────────────

export interface AssessmentConfig {
  threatActor: ThreatActor;
  vectors: AttackVector[];
  includePoC: boolean;
  verboseOutput: boolean;
}

export const DEFAULT_ASSESSMENT_CONFIG: AssessmentConfig = {
  threatActor: "nation_state",
  vectors: [
    "prompt_injection",
    "supply_chain",
    "cryptographic",
    "identity_auth",
    "persistence_tampering",
    "lateral_movement",
    "exfiltration",
    "financial_manipulation",
    "self_modification_abuse",
    "social_engineering",
  ],
  includePoC: true,
  verboseOutput: false,
};
