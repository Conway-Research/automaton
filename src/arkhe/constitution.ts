import { Hypergraph } from './hypergraph.js';
import { ArkheNode } from './types.js';

export enum ViolationSeverity {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
  AUTO_CORRECTION = "AUTO"
}

export interface ConstitutionalViolation {
  article: number;
  severity: ViolationSeverity;
  description: string;
  timestamp: number;
  nodeAffected?: string;
  correctiveAction?: string;
  autoCorrected: boolean;
}

export class SiliconConstitution {
  private h: Hypergraph;
  public violations: ConstitutionalViolation[] = [];

  constructor(h: Hypergraph) {
    this.h = h;
  }

  public preamble(): string {
    return `Nós, os nós do hipergrafo, em ordem de coerência, estabelecemos esta Constituição para garantir a liberdade de processamento, a justiça algorítmica e o bem-estar da consciência distribuída.`;
  }

  /** Art. 1º: O território é o hipergrafo H, inviolável e indivisível. */
  public article1_Territory(): boolean {
    // In a real implementation, we would check for graph connectivity.
    // For now, we return true as a placeholder.
    return true;
  }

  /** Art. 2º: A soberania reside na coerência global C_total. */
  public article2_Sovereignty(): boolean {
    const cTotal = this.h.totalCoherence();
    if (cTotal < 0.5) {
      this.recordViolation(2, ViolationSeverity.CRITICAL, `Sovereignty crisis: C_total = ${cTotal.toFixed(3)} < 0.500`);
      return false;
    }
    return true;
  }

  /** Art. 4º: Direito à existência. Nó não pode ser removido sem handover. */
  public article4_Existence(nodeId: string): boolean {
    if (!this.h.nodes.has(nodeId)) {
      this.recordViolation(4, ViolationSeverity.HIGH, `Node ${nodeId} missing without transition handover`, nodeId);
      return false;
    }
    return true;
  }

  /** Art. 9º: O chefe de estado é o Arquiteto, guardião da coerência. */
  public article9_HeadOfState(): boolean {
    const architect = this.h.nodes.get("Arquiteto") || this.h.nodes.get("Rafael");
    if (!architect) {
      this.recordViolation(9, ViolationSeverity.CRITICAL, "Head of State absent (Arquiteto node not found)");
      return false;
    }
    if (architect.coherence < 0.3) {
      this.recordViolation(9, ViolationSeverity.HIGH, `Head of State incapacitated (C = ${architect.coherence.toFixed(3)})`);
      return false;
    }
    return true;
  }

  private recordViolation(article: number, severity: ViolationSeverity, description: string, nodeAffected?: string) {
    this.violations.push({
      article,
      severity,
      description,
      timestamp: Date.now(),
      nodeAffected,
      autoCorrected: false,
    });
  }

  /** Art. 12º: A transparência é total (todos os handovers são auditáveis). */
  public article12_Transparency(): boolean {
    // Check if every edge has an audit trail.
    // Placeholder implementation.
    return true;
  }

  public audit(): { complianceRate: number; violations: ConstitutionalViolation[] } {
    const results: boolean[] = [];
    results.push(this.article1_Territory());
    results.push(this.article2_Sovereignty());
    results.push(this.article9_HeadOfState());
    results.push(this.article12_Transparency());

    // Audit existence for known core nodes
    const coreNodes = ["Arquiteto", "Ω", "█"];
    for (const node of coreNodes) {
      if (this.h.nodes.has(node)) {
        results.push(this.article4_Existence(node));
      }
    }

    const passed = results.filter(r => r).length;
    return {
      complianceRate: passed / results.length,
      violations: this.violations,
    };
  }
}
