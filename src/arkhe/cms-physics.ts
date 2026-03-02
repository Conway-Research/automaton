import { Hypergraph } from './hypergraph.js';
import { ArkheNode } from './types.js';

/**
 * CMS Dark Shower Simulation - ARKHE-PARTICLE v2.0
 * Based on CMS EXO-24-008 and Block Ω+∞+40.
 */
export class CMSDarkShower {
  private c0: number = 0.9; // Initial coherence (Higgs)
  private beta: number = 0.7; // Scaling exponent

  constructor(public h: Hypergraph) {}

  /**
   * Simulates a Higgs decay into a dark shower cascade.
   */
  public simulate(eCm: number = 13000, mDark: number = 2.0): void {
    // Stage 0: Higgs Node (Source Node)
    const higgs = this.h.addNode(undefined, { type: 'Higgs', mass: 125 });

    // Stage 1: Dark Partons
    const parton1 = this.h.addNode(undefined, { type: 'DarkParton' });
    const parton2 = this.h.addNode(undefined, { type: 'DarkParton' });
    this.h.addEdge(new Set([higgs.id, parton1.id, parton2.id]), this.c0);

    // Stage 2: Hadronization (Fractal Recursion)
    // Multiplicity follows power law scaling predicted by Arkhe(n)
    const nMesons = Math.floor(this.predictMultiplicity(eCm, mDark));
    const darkMesons: ArkheNode[] = [];

    for (let i = 0; i < nMesons; i++) {
      const meson = this.h.addNode(undefined, {
        type: 'DarkMeson',
        mass: mDark,
        isLongLived: Math.random() > 0.1
      });
      meson.coherence = this.c0 * Math.exp(-Math.random() * 0.1);
      darkMesons.push(meson);
      this.h.addEdge(new Set([parton1.id, meson.id]), 0.8);
      this.h.addEdge(new Set([parton2.id, meson.id]), 0.8);
    }

    // Stage 3: Observed Handovers (Secondary Vertices)
    for (const meson of darkMesons) {
      if (meson.data.isLongLived) {
        const muon1 = this.h.addNode(undefined, { type: 'Muon', prompt: false });
        const muon2 = this.h.addNode(undefined, { type: 'Muon', prompt: false });

        // Displacement lxy = γβcτ
        const lxy = Math.random() * 100; // placeholder
        const edge = this.h.addEdge(new Set([meson.id, muon1.id, muon2.id]), 0.95);
        edge.metadata = {
          lxy,
          pointingAngle: this.predictPointingWidth(mDark) * Math.random(),
          invariantMass: mDark
        };
      }
    }

    this.h.bootstrapStep();
  }

  /**
   * Previsão 1: Lei de Escala para Multiplicidade
   * <N> ~ (E_CM / m_dark)^beta
   */
  public predictMultiplicity(eCm: number, mDark: number): number {
    return 5 * Math.pow(eCm / (100 * mDark), this.beta);
  }

  /**
   * Previsão 2: Correlação Angular como Medida de Coerência
   * sigma_theta ~ sqrt(1 - C_intermediate)
   */
  public predictPointingWidth(mass: number): number {
    const cIntermediate = this.c0 * Math.exp(-mass / 10);
    return Math.sqrt(1 - cIntermediate);
  }

  /**
   * Parameter A_shower: Handover Efficiency (Ω+∞+40)
   * A_shower = eps_geom * eps_temp * eps_res * C_avg
   */
  public computeAShower(
    nObs: number,
    nProd: number,
    cAvg: number,
    epsGeom: number = 0.8,
    epsRes: number = 0.9
  ): number {
    if (nProd === 0) return 0;

    // eps_temp is the fraction of reachable handovers in the detector window
    const epsTemp = nObs / nProd;

    const aShower = epsGeom * epsTemp * epsRes * cAvg;
    return aShower;
  }
}

/**
 * BDT implementation remain as Kernel Consensus.
 */
export class DarkShowerBDT {
  private thresholds = {
    vector_portal: 0.997,
    low_mass: 0.999
  };

  public discriminate(coherence: number, model: 'vector_portal' | 'low_mass' = 'vector_portal'): boolean {
    return coherence > this.thresholds[model];
  }
}

export class PhiUpperLimit {
  public static compare(limit: number): string {
    return limit < 0.001 ? "Φ_arkhe ~ Φ_cms (Rare)" : "Φ_arkhe >> Φ_cms (Frequent)";
  }
}
