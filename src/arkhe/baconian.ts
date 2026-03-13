import { Hypergraph } from './hypergraph.js';
import { ArkheNode } from './types.js';

export enum IdolType {
  TRIBUS = "IDOLUM_TRIBUS",   // Collective sensory bias
  SPECUS = "IDOLUM_SPECUS",   // Individual idiosyncrasies
  FORI = "IDOLUM_FORI",       // Semantic confusion
  THEATRI = "IDOLUM_THEATRI"  // Confirmation bias
}

export interface Observation {
  phenomenon: string;
  context: string;
  result: boolean;
  intensity: number;
  validator: string;
  timestamp: number;
}

export interface Idol {
  type: IdolType;
  severity: number;
  description: string;
  affectedNodes: string[];
}

export interface TableOfInstance {
  presence: Observation[];
  absence: Observation[];
  degrees: Observation[];
}

export interface Law {
  phenomenon: string;
  lawText: string;
  confidence: number;
  votes: number;
  timestamp: number;
}

/**
 * BaconianKeeper - Implements Francis Bacon's scientific method as a data pipeline.
 * Based on Novum Organum (1620) and Arkhe(n) Block Ω+∞+54.
 */
export class BaconianKeeper {
  private observations: Observation[] = [];
  public laws: Map<string, Law> = new Map();
  public detectedIdols: Idol[] = [];

  constructor(private h: Hypergraph) {}

  public addObservation(obs: Observation): void {
    this.observations.push(obs);
  }

  /**
   * PerformInduction - Pipeline completo de indução (5 fases)
   */
  public performInduction(phenomenon: string): { law?: Law; idols: Idol[]; confidence: number } {
    const relevantObs = this.observations.filter(o => o.phenomenon === phenomenon);
    if (relevantObs.length < 10) {
      return { idols: [], confidence: 0 };
    }

    // 1. Organize Tables
    const tables = this.organizeTables(relevantObs);

    // 2. Detect Idols
    const idols = this.detectIdols(relevantObs, tables);
    this.detectedIdols.push(...idols);

    // 3. Apply Corrections (Downweighting biased observations)
    const correctedObs = this.applyCorrections(relevantObs, idols);

    // 4. Infer Law
    const lawCandidate = this.inferLaw(phenomenon, tables, correctedObs);

    // 5. Finalize
    if (lawCandidate && lawCandidate.confidence > 0.8) {
      this.laws.set(phenomenon, lawCandidate);
      this.applyCoherenceImpact(idols, lawCandidate);
    }

    return { law: lawCandidate, idols, confidence: lawCandidate?.confidence || 0 };
  }

  private organizeTables(obs: Observation[]): TableOfInstance {
    return {
      presence: obs.filter(o => o.result === true),
      absence: obs.filter(o => o.result === false),
      degrees: obs.sort((a, b) => b.intensity - a.intensity)
    };
  }

  private detectIdols(obs: Observation[], tables: TableOfInstance): Idol[] {
    const idols: Idol[] = [];
    const uniqueValidators = new Set(obs.map(o => o.validator));

    // IDOLUM TRIBUS (Ídolos da Tribo)
    if (uniqueValidators.size < 3 && obs.length > 20) {
      idols.push({
        type: IdolType.TRIBUS,
        severity: 0.5,
        description: "Collective sensory bias: low validator diversity for large observation set",
        affectedNodes: Array.from(uniqueValidators)
      });
    }

    // IDOLUM SPECUS (Ídolos da Caverna)
    for (const val of uniqueValidators) {
      const valObs = obs.filter(o => o.validator === val);
      const valMean = valObs.reduce((acc, o) => acc + o.intensity, 0) / valObs.length;
      const globalMean = obs.reduce((acc, o) => acc + o.intensity, 0) / obs.length;

      if (Math.abs(valMean - globalMean) > 0.3) {
        idols.push({
          type: IdolType.SPECUS,
          severity: 0.4,
          description: `Individual idiosyncratic bias for validator ${val}`,
          affectedNodes: [val]
        });
      }
    }

    // IDOLUM FORI (Ídolos do Fórum)
    const uniqueContexts = new Set(obs.map(o => o.context));
    if (uniqueContexts.size / obs.length > 0.5) {
      idols.push({
        type: IdolType.FORI,
        severity: 0.6,
        description: "Semantic confusion: context definitions too fragmented",
        affectedNodes: []
      });
    }

    // IDOLUM THEATRI (Ídolos do Teatro)
    const presenceRatio = tables.presence.length / obs.length;
    if (presenceRatio > 0.9) {
      idols.push({
        type: IdolType.THEATRI,
        severity: 0.7,
        description: "Confirmation bias: excessive positive presence ratio, lack of negative controls",
        affectedNodes: []
      });
    }

    return idols;
  }

  private applyCorrections(obs: Observation[], idols: Idol[]): Observation[] {
    let corrected = [...obs];
    for (const idol of idols) {
      if (idol.type === IdolType.TRIBUS || idol.type === IdolType.SPECUS) {
        corrected = corrected.map(o => {
          if (idol.affectedNodes.includes(o.validator)) {
            return { ...o, intensity: o.intensity * (1 - idol.severity) };
          }
          return o;
        });
      }
    }
    return corrected;
  }

  private inferLaw(phenomenon: string, tables: TableOfInstance, obs: Observation[]): Law {
    // Simplified causal inference: find common keywords in contexts where result is true
    const contexts = tables.presence.map(o => o.context.split(" "));
    const commonKeywords = contexts.length > 0 ? contexts[0].filter(kw => contexts.every(c => c.includes(kw))) : [];

    const lawText = commonKeywords.length > 0
      ? `∀x: ${commonKeywords.join(" + ")} → ${phenomenon}`
      : `Indeterminate law for ${phenomenon}`;

    const confidence = Math.min(1, (tables.presence.length / obs.length) * (1 + tables.absence.length / 10));

    return {
      phenomenon,
      lawText,
      confidence,
      votes: 0,
      timestamp: Date.now()
    };
  }

  private applyCoherenceImpact(idols: Idol[], law: Law): void {
    // Laws increase coherence
    const deltaC = law.confidence * 0.01;
    this.h.phiValue += deltaC;

    // Idols decrease it
    for (const idol of idols) {
      this.h.phiValue -= idol.severity * 0.02;
      for (const nodeId of idol.affectedNodes) {
        const node = this.h.nodes.get(nodeId);
        if (node) {
          node.coherence = Math.max(0, node.coherence - idol.severity * 0.05);
        }
      }
    }
  }

  public getLaw(phenomenon: string): Law | undefined {
    return this.laws.get(phenomenon);
  }
}
