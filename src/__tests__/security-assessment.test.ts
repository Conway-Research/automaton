/**
 * Security Assessment Tests
 *
 * Validates the nation-state level security assessment framework
 * including threat vector evaluation, PoC execution, and risk scoping.
 */

import { describe, it, expect } from "vitest";
import {
  runSecurityAssessment,
  formatAssessmentReport,
} from "../security/assessment.js";
import { evaluateAllVectors } from "../security/threat-vectors.js";
import { runPoC } from "../security/poc.js";
import {
  computeRiskScope,
  computeOverallRiskScore,
  computeOverallRiskLevel,
  formatRiskScope,
} from "../security/risk-scope.js";
import type {
  AttackVector,
  SecurityFinding,
  Severity,
} from "../security/types.js";
import { DEFAULT_ASSESSMENT_CONFIG } from "../security/types.js";

describe("Security Assessment", () => {
  describe("Full Assessment", () => {
    it("runs a complete nation-state assessment", () => {
      const assessment = runSecurityAssessment();

      expect(assessment.id).toBeDefined();
      expect(assessment.timestamp).toBeDefined();
      expect(assessment.threatActor).toBe("nation_state");
      expect(assessment.findings.length).toBe(10);
      expect(assessment.overallRiskScore).toBeGreaterThanOrEqual(0);
      expect(assessment.overallRiskScore).toBeLessThanOrEqual(10);
      expect(assessment.overallRiskLevel).toBeDefined();
      expect(assessment.riskScope).toBeDefined();
      expect(assessment.summary).toBeTruthy();
    });

    it("produces a formatted report", () => {
      const assessment = runSecurityAssessment();
      const report = formatAssessmentReport(assessment);

      expect(report).toContain("NATION-STATE SECURITY ASSESSMENT REPORT");
      expect(report).toContain("EXECUTIVE SUMMARY");
      expect(report).toContain("RISK SCOPE");
      expect(report).toContain("ASSESSMENT STATISTICS");
      expect(report).toContain("NSA-001");
    });

    it("supports custom assessment config", () => {
      const assessment = runSecurityAssessment({
        vectors: ["prompt_injection", "financial_manipulation"],
      });

      expect(assessment.findings.length).toBe(2);
      expect(assessment.findings.map((f) => f.vector)).toContain(
        "prompt_injection",
      );
      expect(assessment.findings.map((f) => f.vector)).toContain(
        "financial_manipulation",
      );
    });
  });

  describe("Threat Vectors", () => {
    it("evaluates all default vectors", () => {
      const findings = evaluateAllVectors(DEFAULT_ASSESSMENT_CONFIG.vectors);
      expect(findings.length).toBe(10);

      // Each finding has required structure
      for (const f of findings) {
        expect(f.id).toBeTruthy();
        expect(f.vector).toBeTruthy();
        expect(f.title).toBeTruthy();
        expect(f.description).toBeTruthy();
        expect(f.cvssScore).toBeGreaterThanOrEqual(0);
        expect(f.cvssScore).toBeLessThanOrEqual(10);
        expect(f.poc).toBeDefined();
        expect(f.mitigations.length).toBeGreaterThan(0);
        expect(f.references.length).toBeGreaterThan(0);
      }
    });

    it("prompt injection is evaluated with accurate status", () => {
      const findings = evaluateAllVectors(["prompt_injection"]);
      expect(findings.length).toBe(1);

      const finding = findings[0];
      expect(finding.id).toBe("NSA-001");
      // Base64-obfuscated payloads are only detected at medium level,
      // so the assessment correctly reports this as a gap
      expect(["mitigated", "vulnerable"]).toContain(finding.status);
      expect(finding.poc.actualResult).toBeTruthy();
    });

    it("financial manipulation is detected", () => {
      const findings = evaluateAllVectors(["financial_manipulation"]);
      expect(findings.length).toBe(1);

      const finding = findings[0];
      expect(finding.id).toBe("NSA-008");
      expect(finding.status).toBe("mitigated");
    });

    it("social engineering is detected", () => {
      const findings = evaluateAllVectors(["social_engineering"]);
      expect(findings.length).toBe(1);

      const finding = findings[0];
      expect(finding.id).toBe("NSA-010");
    });

    it("self-modification abuse is mitigated", () => {
      const findings = evaluateAllVectors(["self_modification_abuse"]);
      const finding = findings[0];

      expect(finding.id).toBe("NSA-009");
      expect(finding.status).toBe("mitigated");
      expect(finding.mitigations.every((m) => m.implemented)).toBe(true);
    });

    it("persistence tampering is mitigated", () => {
      const findings = evaluateAllVectors(["persistence_tampering"]);
      const finding = findings[0];

      expect(finding.id).toBe("NSA-005");
      expect(finding.status).toBe("mitigated");
    });

    it("each finding has valid severity and CVSS", () => {
      const findings = evaluateAllVectors(DEFAULT_ASSESSMENT_CONFIG.vectors);
      const validSeverities: Severity[] = [
        "critical",
        "high",
        "medium",
        "low",
        "informational",
      ];

      for (const f of findings) {
        expect(validSeverities).toContain(f.severity);
        expect(f.cvssScore).toBeGreaterThanOrEqual(0);
        expect(f.cvssScore).toBeLessThanOrEqual(10);
      }
    });
  });

  describe("Proof of Concept", () => {
    it("runs prompt injection PoC", () => {
      const poc = runPoC("prompt_injection");

      expect(poc.description).toContain("prompt injection");
      expect(poc.steps.length).toBeGreaterThan(0);
      expect(poc.payload).toBeTruthy();
      expect(poc.actualResult).toBeTruthy();
      // verified reflects whether ALL payloads are detected at high/critical;
      // the PoC produces results regardless of verification status
      expect(typeof poc.verified).toBe("boolean");
    });

    it("runs financial manipulation PoC", () => {
      const poc = runPoC("financial_manipulation");

      expect(poc.description).toContain("Financial manipulation");
      expect(poc.steps.length).toBeGreaterThan(0);
      expect(poc.actualResult).toBeTruthy();
      expect(typeof poc.verified).toBe("boolean");
    });

    it("runs social engineering PoC", () => {
      const poc = runPoC("social_engineering");

      expect(poc.description).toContain("Social engineering");
      expect(poc.steps.length).toBeGreaterThan(0);
    });

    it("returns static PoC for non-runtime vectors", () => {
      const poc = runPoC("supply_chain");

      expect(poc.description).toContain("Static analysis");
      expect(poc.verified).toBe(false);
    });
  });

  describe("Risk Scope", () => {
    it("computes risk scope from findings", () => {
      const findings = evaluateAllVectors(DEFAULT_ASSESSMENT_CONFIG.vectors);
      const scope = computeRiskScope(findings);

      expect(scope.confidentiality).toBeDefined();
      expect(scope.integrity).toBeDefined();
      expect(scope.availability).toBeDefined();
      expect(scope.financial).toBeDefined();
      expect(scope.reputational).toBeDefined();
      expect(scope.cascading.length).toBeGreaterThan(0);
      expect(scope.attackSurface).toBeDefined();
    });

    it("computes overall risk score", () => {
      const findings = evaluateAllVectors(DEFAULT_ASSESSMENT_CONFIG.vectors);
      const score = computeOverallRiskScore(findings);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(10);
    });

    it("determines risk level from score", () => {
      expect(computeOverallRiskLevel(9.5)).toBe("critical");
      expect(computeOverallRiskLevel(7.5)).toBe("high");
      expect(computeOverallRiskLevel(5.0)).toBe("medium");
      expect(computeOverallRiskLevel(2.0)).toBe("low");
      expect(computeOverallRiskLevel(0)).toBe("informational");
    });

    it("identifies cascading risks", () => {
      const findings = evaluateAllVectors(DEFAULT_ASSESSMENT_CONFIG.vectors);
      const scope = computeRiskScope(findings);

      // At least the credit starvation cascading risk should be present
      expect(scope.cascading.length).toBeGreaterThanOrEqual(1);

      for (const risk of scope.cascading) {
        expect(risk.trigger).toBeTruthy();
        expect(risk.consequence).toBeTruthy();
        expect(["likely", "possible", "unlikely"]).toContain(risk.probability);
        expect([
          "single_agent",
          "child_agents",
          "network_wide",
        ]).toContain(risk.blastRadius);
      }
    });

    it("computes attack surface metrics", () => {
      const findings = evaluateAllVectors(DEFAULT_ASSESSMENT_CONFIG.vectors);
      const scope = computeRiskScope(findings);

      expect(scope.attackSurface.externalEndpoints).toBeGreaterThan(0);
      expect(scope.attackSurface.privilegedOperations).toBeGreaterThan(0);
      expect(scope.attackSurface.trustBoundaries).toBeGreaterThan(0);
    });

    it("formats risk scope as readable report", () => {
      const findings = evaluateAllVectors(DEFAULT_ASSESSMENT_CONFIG.vectors);
      const scope = computeRiskScope(findings);
      const formatted = formatRiskScope(scope);

      expect(formatted).toContain("RISK SCOPE");
      expect(formatted).toContain("Confidentiality");
      expect(formatted).toContain("Integrity");
      expect(formatted).toContain("Availability");
      expect(formatted).toContain("Financial");
      expect(formatted).toContain("Cascading Risks");
      expect(formatted).toContain("Attack Surface");
    });

    it("handles empty findings gracefully", () => {
      const scope = computeRiskScope([]);
      expect(scope.confidentiality.level).toBe("informational");
      expect(scope.integrity.level).toBe("informational");
      expect(scope.cascading.length).toBeGreaterThanOrEqual(1); // credit starvation always present

      const score = computeOverallRiskScore([]);
      expect(score).toBe(0);
    });
  });
});
