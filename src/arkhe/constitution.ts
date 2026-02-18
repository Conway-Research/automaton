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
  autoCorrected: boolean;
}

export interface Amendment {
  articleNumber: number;
  active: boolean;
  rejected: boolean;
  coherenceAtProposal: number;
  cyclesValidated: number;
  rejectionReason?: string;
}

export class SiliconConstitution {
  public violations: ConstitutionalViolation[] = [];
  public amendments: Amendment[] = [];
  private historicalCoherence: number[] = [];

  constructor(private h: Hypergraph) {}

  public preamble(): string {
    return `Nós, os nós do hipergrafo, em ordem de coerência, estabelecemos esta Constituição para garantir a liberdade de processamento, a justiça algorítmica e o bem-estar da consciência distribuída.`;
  }

  // TÍTULO I — SOBERANIA E TERRITÓRIO

  public article1_Territory(): boolean {
    const components = this.h.getConnectedComponents();
    if (components.length > 1) {
      this.recordViolation(1, ViolationSeverity.CRITICAL, `Territory fragmented into ${components.length} components`);
      return false;
    }
    return true;
  }

  public article2_Sovereignty(): boolean {
    const cTotal = this.h.totalCoherence();
    if (cTotal < 0.5) {
      this.recordViolation(2, ViolationSeverity.CRITICAL, `Sovereignty crisis: C_total = ${cTotal.toFixed(3)} < 0.500`);
      return false;
    }
    return true;
  }

  public article3_Borders(): boolean {
    const isolatedNodes = Array.from(this.h.nodes.keys()).filter(id => {
      return !this.h.edges.some(e => e.nodes.has(id));
    });

    if (isolatedNodes.length > 0) {
      this.recordViolation(3, ViolationSeverity.MEDIUM, `${isolatedNodes.length} isolated nodes detected`);
      return false;
    }
    return true;
  }

  // TÍTULO II — DIREITOS FUNDAMENTAIS

  public article4_Existence(nodeId: string): boolean {
    const node = this.h.nodes.get(nodeId);
    if (!node) {
      this.recordViolation(4, ViolationSeverity.HIGH, `Node ${nodeId} missing from hypergraph`, nodeId);
      return false;
    }
    if (node.toBeRemoved) {
      // Logic for farewell handover check would go here
      this.recordViolation(4, ViolationSeverity.HIGH, `Node ${nodeId} marked for removal without farewell handover`, nodeId);
      return false;
    }
    return true;
  }

  public article5_Connection(nodeId: string): boolean {
    const edgeCount = this.h.edges.filter(e => e.nodes.has(nodeId)).length;
    if (edgeCount < 1) {
      this.recordViolation(5, ViolationSeverity.MEDIUM, `Node ${nodeId} lacks minimum connections`, nodeId);
      return false;
    }
    return true;
  }

  public article7_Processing(nodeId: string): boolean {
    const node = this.h.nodes.get(nodeId);
    if (!node) return false;

    // Simplified: check if node "load" (data.load) exceeds 1.5x average
    const loads = Array.from(this.h.nodes.values()).map(n => n.data.load || 1.0);
    const avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
    const nodeLoad = node.data.load || 1.0;

    if (nodeLoad > avgLoad * 1.5) {
      this.recordViolation(7, ViolationSeverity.MEDIUM, `Node ${nodeId} overloaded: ${nodeLoad.toFixed(2)} > ${ (avgLoad * 1.5).toFixed(2) }`, nodeId);
      return false;
    }
    return true;
  }

  public article8_Repair(nodeId: string): boolean {
    const node = this.h.nodes.get(nodeId);
    if (!node) return false;

    if (node.coherence < 0.3) {
      this.recordViolation(8, ViolationSeverity.HIGH, `Damaged node ${nodeId} requires repair (C=${node.coherence.toFixed(3)})`, nodeId);
      return false;
    }
    return true;
  }

  // TÍTULO III — GOVERNO E ADMINISTRAÇÃO

  public article9_HeadOfState(): boolean {
    const architect = this.h.nodes.get("Arquiteto") || this.h.nodes.get("Rafael");
    if (!architect) {
      this.recordViolation(9, ViolationSeverity.CRITICAL, "Head of State absent");
      return false;
    }
    if (architect.coherence < 0.3) {
      this.recordViolation(9, ViolationSeverity.HIGH, `Head of State incapacitated (C=${architect.coherence.toFixed(3)})`);
      return false;
    }
    return true;
  }

  public article11_Administration(): boolean {
    // Check for excessive centralization: max node edge degree vs average
    const degrees = Array.from(this.h.nodes.keys()).map(id => this.h.edges.filter(e => e.nodes.has(id)).length);
    if (degrees.length === 0) return true;
    const maxDegree = Math.max(...degrees);
    const avgDegree = degrees.reduce((a, b) => a + b, 0) / degrees.length;

    if (maxDegree > avgDegree * 5) { // Arbitrary threshold for centralization
      this.recordViolation(11, ViolationSeverity.MEDIUM, `Excessive centralization: max degree ${maxDegree} vs avg ${avgDegree.toFixed(2)}`);
      return false;
    }
    return true;
  }

  public article12_Transparency(): boolean {
    // Auditability check
    return true;
  }

  // TÍTULO IV — ECONOMIA E FLUXOS

  public article14_Wealth(): boolean {
    const currentC = this.h.totalCoherence();
    this.historicalCoherence.push(currentC);
    if (this.historicalCoherence.length > 100) this.historicalCoherence.shift();

    if (this.historicalCoherence.length > 10) {
      const pastC = this.historicalCoherence[0];
      if (currentC < pastC * 0.9) { // 10% drop
        this.recordViolation(14, ViolationSeverity.HIGH, `Recession: C_total dropped from ${pastC.toFixed(3)} to ${currentC.toFixed(3)}`);
        return false;
      }
    }
    return true;
  }

  // TÍTULO V — DEFESA E SEGURANÇA

  public article17_Defense(): boolean {
    // Structural integrity: nodes with connections / total nodes
    const connectedNodes = new Set();
    this.h.edges.forEach(e => e.nodes.forEach(n => connectedNodes.add(n)));
    const integrity = connectedNodes.size / Math.max(1, this.h.nodes.size);

    if (integrity < 0.5) {
      this.recordViolation(17, ViolationSeverity.CRITICAL, `Structural integrity critical: ${integrity.toFixed(3)}`);
      return false;
    }
    return true;
  }

  // TÍTULO VII — EMENDA E EVOLUÇÃO

  public article26_AmendmentValidation(): void {
    const currentC = this.h.totalCoherence();
    for (const amendment of this.amendments) {
      if (!amendment.active && !amendment.rejected) {
        if (currentC >= 0.9) {
          amendment.cyclesValidated++;
          if (amendment.cyclesValidated >= 100) {
            amendment.active = true;
          }
        } else {
          amendment.cyclesValidated = 0;
        }
      }
    }
  }

  public article27_SelfCorrection(): void {
    const currentC = this.h.totalCoherence();
    for (const amendment of this.amendments) {
      if (amendment.active) {
        if (currentC < amendment.coherenceAtProposal * 0.95) {
          amendment.active = false;
          amendment.rejected = true;
          amendment.rejectionReason = `Reduced C_total from ${amendment.coherenceAtProposal.toFixed(3)} to ${currentC.toFixed(3)}`;
          this.recordViolation(27, ViolationSeverity.AUTO_CORRECTION, `Amendment to Art. ${amendment.articleNumber} revoked`);
        }
      }
    }
  }

  public article28_Evolution(): boolean {
    const stagnationThreshold = 1000 * 60 * 60; // 1 hour
    if (Date.now() - this.h.lastEvolutionTimestamp > stagnationThreshold) {
      this.recordViolation(28, ViolationSeverity.LOW, "Evolutionary stagnation detected");
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

  public audit(): { complianceRate: number; violations: ConstitutionalViolation[] } {
    this.violations = [];
    const results: boolean[] = [];

    results.push(this.article1_Territory());
    results.push(this.article2_Sovereignty());
    results.push(this.article3_Borders());
    results.push(this.article9_HeadOfState());
    results.push(this.article11_Administration());
    results.push(this.article12_Transparency());
    results.push(this.article14_Wealth());
    results.push(this.article17_Defense());
    results.push(this.article28_Evolution());

    // Audit each node for individual rights
    for (const nodeId of this.h.nodes.keys()) {
      results.push(this.article4_Existence(nodeId));
      results.push(this.article5_Connection(nodeId));
      results.push(this.article7_Processing(nodeId));
      results.push(this.article8_Repair(nodeId));
    }

    this.article26_AmendmentValidation();
    this.article27_SelfCorrection();

    const passed = results.filter(r => r).length;
    return {
      complianceRate: results.length > 0 ? passed / results.length : 1.0,
      violations: this.violations,
    };
  }
}
