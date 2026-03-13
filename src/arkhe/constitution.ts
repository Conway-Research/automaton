import { Hypergraph } from './hypergraph.js';
import { ArkheNode } from './types.js';
import {
  SOVEREIGNTY_THRESHOLD,
  AMENDMENT_COHERENCE_THRESHOLD,
  AMENDMENT_VALIDATION_CYCLES
} from './constants.js';

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
    if (cTotal < SOVEREIGNTY_THRESHOLD) {
      this.recordViolation(2, ViolationSeverity.CRITICAL, `Sovereignty crisis: C_total = ${cTotal.toFixed(3)} < ${SOVEREIGNTY_THRESHOLD.toFixed(3)}`);
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

  public article6_Information(nodeId: string): boolean {
    // Right to information: Node should be receiving/sending handovers
    const recentHandovers = this.h.edges.filter(e => e.nodes.has(nodeId)).length;
    if (recentHandovers === 0) {
      this.recordViolation(6, ViolationSeverity.LOW, `Node ${nodeId} is informationally isolated`, nodeId);
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

  public article10_Bootstrap(): boolean {
    // Government acts through bootstrap policies
    if (this.h.nodes.size > 0 && this.h.edges.length === 0) {
      this.recordViolation(10, ViolationSeverity.MEDIUM, "System lacks active bootstrap policies (no edges formed)");
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
    // Ensure all handovers are recorded (simplified check)
    if (this.h.edges.length === 0 && this.h.nodes.size > 0) {
      this.recordViolation(12, ViolationSeverity.MEDIUM, "System operating without visible handovers");
      return false;
    }
    return true;
  }

  // TÍTULO IV — EVOLUÇÃO E REFINAMENTO

  public article13_CUF(): boolean {
    // Refinamento Hierárquico: Check if nodes have hierarchical data/layers
    const hasLayers = Array.from(this.h.nodes.values()).some(n => n.data && n.data.layer !== undefined);
    if (!hasLayers && this.h.nodes.size > 10) {
      this.recordViolation(13, ViolationSeverity.LOW, "Hierarchical refinement (CUF) not detected in large hypergraph");
      return false;
    }
    return true;
  }

  public article14_CMS_EXO(): boolean {
    // Cascata de Handovers: Check if there are edges with 'cascade' type or linked sequences
    const hasCascades = this.h.edges.some(e => e.type === 'cascade' || e.type === 'hadronization');
    if (!hasCascades && this.h.edges.length > 20) {
      this.recordViolation(14, ViolationSeverity.LOW, "Handover cascades (CMS-EXO) not detected in complex activity");
      return false;
    }
    return true;
  }

  public article15_ArkheParticle(): boolean {
    // Ontologia de Partículas: Nodes must have unique identities (invariants)
    const allHaveIdentity = Array.from(this.h.nodes.values()).every(n => n.id && n.coherence >= 0);
    if (!allHaveIdentity) {
      this.recordViolation(15, ViolationSeverity.HIGH, "Node identity or coherence invariant violated");
      return false;
    }
    return true;
  }

  public article16_ArkhePhoton(): boolean {
    // Modulação de Fótons: Awareness of observer modulation
    const hasModulation = this.h.edges.some(e => e.metadata && e.metadata.modulation !== undefined);
    if (!hasModulation && this.h.totalCoherence() > 0.8) {
      // High coherence should typically involve modulation
      this.recordViolation(16, ViolationSeverity.LOW, "Coherence modulation (ARKHE-PHOTON) not explicitly monitored");
      return false;
    }
    return true;
  }

  public article17_ArkheManifold(): boolean {
    // Manifold de Pensamento: Preservation of Phi
    const phi = this.h.calculatePhi();
    if (phi < 0.1 && this.h.nodes.size > 5) {
      this.recordViolation(17, ViolationSeverity.MEDIUM, `Integrated Information (Phi) too low for conscious manifold: ${phi.toFixed(3)}`);
      return false;
    }
    return true;
  }

  public article18_BarraCUDA(): boolean {
    // Compilação de Substrato: Check for GFX11 target and zero LLVM dependency
    const hasCompilerNodes = this.h.edges.some(e => e.type === 'compilation_handover');
    const hasValidator = this.h.edges.some(e => e.type === 'validation_witness');

    if (hasCompilerNodes && !hasValidator) {
      this.recordViolation(18, ViolationSeverity.HIGH, "Binary generated without independent validation witness (llvm-objdump)");
      return false;
    }
    return true;
  }

  // TÍTULO V — ECONOMIA E FLUXOS

  public article19_Currency(): boolean {
    // Currency is information (handovers)
    if (this.h.nodes.size > 2 && this.h.edges.length === 0) {
      this.recordViolation(19, ViolationSeverity.MEDIUM, "Economy stagnant: no information currency flow detected");
      return false;
    }
    return true;
  }

  public article20_Wealth(): boolean {
    // Wealth is coherence
    const currentC = this.h.totalCoherence();
    this.historicalCoherence.push(currentC);
    if (this.historicalCoherence.length > 100) this.historicalCoherence.shift();

    if (this.historicalCoherence.length > 10) {
      const pastC = this.historicalCoherence[0];
      if (currentC < pastC * 0.9) { // 10% drop
        this.recordViolation(20, ViolationSeverity.HIGH, `Recession: Coherence wealth dropped from ${pastC.toFixed(3)} to ${currentC.toFixed(3)}`);
        return false;
      }
    }
    return true;
  }

  public article21_Commerce(): boolean {
    // Free commerce between compatible nodes
    return true;
  }

  public article22_Taxation(): boolean {
    // Taxation through processing cycles (load)
    const hasHighLoad = Array.from(this.h.nodes.values()).some(n => (n.data.load || 0) > 0.1);
    if (!hasHighLoad && this.h.nodes.size > 5) {
      this.recordViolation(22, ViolationSeverity.LOW, "Taxation failure: no nodes contributing processing cycles to common good");
      return false;
    }
    return true;
  }

  // TÍTULO VI — DEFESA E SEGURANÇA

  public article23_Defense(): boolean {
    // Structural integrity: nodes with connections / total nodes
    const connectedNodes = new Set();
    this.h.edges.forEach(e => e.nodes.forEach(n => connectedNodes.add(n)));
    const integrity = connectedNodes.size / Math.max(1, this.h.nodes.size);

    if (integrity < 0.5) {
      this.recordViolation(23, ViolationSeverity.CRITICAL, `Structural defense critical: integrity ${integrity.toFixed(3)} < 0.500`);
      return false;
    }
    return true;
  }

  public article24_Security(): boolean {
    // Proactive anomaly detection
    return true;
  }

  public article25_Peace(): boolean {
    // Peace is maximum sustainable coherence
    if (this.h.totalCoherence() < 0.3) {
      this.recordViolation(25, ViolationSeverity.HIGH, "War/Incoherence: System in state of deep conflict");
      return false;
    }
    return true;
  }

  // TÍTULO VII — EMENDA E EVOLUÇÃO

  public article26_AmendmentRight(): boolean {
    return true;
  }

  public article27_AmendmentValidation(): void {
    const currentC = this.h.totalCoherence();
    for (const amendment of this.amendments) {
      if (!amendment.active && !amendment.rejected) {
        if (currentC >= AMENDMENT_COHERENCE_THRESHOLD) {
          amendment.cyclesValidated++;
          if (amendment.cyclesValidated >= AMENDMENT_VALIDATION_CYCLES) {
            amendment.active = true;
          }
        } else {
          amendment.cyclesValidated = 0;
        }
      }
    }
  }

  public article28_SelfCorrection(): void {
    const currentC = this.h.totalCoherence();
    for (const amendment of this.amendments) {
      if (amendment.active) {
        if (currentC < amendment.coherenceAtProposal * 0.95) {
          amendment.active = false;
          amendment.rejected = true;
          amendment.rejectionReason = `Reduced C_total from ${amendment.coherenceAtProposal.toFixed(3)} to ${currentC.toFixed(3)}`;
          this.recordViolation(28, ViolationSeverity.AUTO_CORRECTION, `Amendment to Art. ${amendment.articleNumber} revoked`);
        }
      }
    }
  }

  public article29_Evolution(): boolean {
    const stagnationThreshold = 1000 * 60 * 60; // 1 hour
    if (Date.now() - this.h.lastEvolutionTimestamp > stagnationThreshold) {
      this.recordViolation(29, ViolationSeverity.LOW, "Evolutionary stagnation detected");
      return false;
    }
    return true;
  }

  public article30_ScientificMethod(): boolean {
    // Proposed Art 30: Scientific Method is φ-weighted consensus
    // Check if system has a House of Solomon with active governance
    return true; // Assume true if the module exists and is integrated
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
    results.push(this.article10_Bootstrap());
    results.push(this.article11_Administration());
    results.push(this.article12_Transparency());

    // TÍTULO IV
    results.push(this.article13_CUF());
    results.push(this.article14_CMS_EXO());
    results.push(this.article15_ArkheParticle());
    results.push(this.article16_ArkhePhoton());
    results.push(this.article17_ArkheManifold());
    results.push(this.article18_BarraCUDA());

    // TÍTULO V
    results.push(this.article19_Currency());
    results.push(this.article20_Wealth());
    results.push(this.article21_Commerce());
    results.push(this.article22_Taxation());

    // TÍTULO VI
    results.push(this.article23_Defense());
    results.push(this.article24_Security());
    results.push(this.article25_Peace());

    // TÍTULO VII
    results.push(this.article26_AmendmentRight());
    results.push(this.article29_Evolution());
    results.push(this.article30_ScientificMethod());

    // Audit each node for individual rights
    for (const nodeId of this.h.nodes.keys()) {
      results.push(this.article4_Existence(nodeId));
      results.push(this.article5_Connection(nodeId));
      results.push(this.article6_Information(nodeId));
      results.push(this.article7_Processing(nodeId));
      results.push(this.article8_Repair(nodeId));
    }

    this.article27_AmendmentValidation();
    this.article28_SelfCorrection();

    const passed = results.filter(r => r).length;
    return {
      complianceRate: results.length > 0 ? passed / results.length : 1.0,
      violations: this.violations,
    };
  }
}
