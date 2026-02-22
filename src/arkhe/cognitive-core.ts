/**
 * Arkhe Cognitive Core - Self-Modulating Neural Evolution Engine
 *
 * Based on Aizawa Attractor dynamics and the fundamental equation:
 *     C + F = 1 (Coherence + Fluctuation = Constant)
 *
 * Translated from Python to TypeScript for the Arkhe(n) framework.
 */

import { Hypergraph } from './hypergraph.js';
import { PHI } from './constants.js';
import { CognitiveState } from './types.js';

export class AizawaAttractor {
  public params: Record<string, number>;
  public state: [number, number, number]; // [x, y, z]
  public trajectory: Array<[number, number, number]> = [];

  constructor(
    a = 0.95,
    b = 0.7,
    c = 0.6,
    d = 3.5,
    e = 0.25,
    f = 0.1
  ) {
    this.params = { a, b, c, d, e, f };
    this.state = [0.1, 0.0, 0.01];
  }

  /**
   * Compute derivatives dx/dt, dy/dt, dz/dt.
   */
  public derivative(state: [number, number, number]): [number, number, number] {
    const [x, y, z] = state;
    const p = this.params;

    const dx = (z - p.b) * x - p.d * y;
    const dy = p.d * x + (z - p.b) * y;
    const dz = (p.c + p.a * z - Math.pow(z, 3) / 3 -
      (Math.pow(x, 2) + Math.pow(y, 2)) * (1 + p.e * z) + p.f * z * Math.pow(x, 3));

    return [dx, dy, dz];
  }

  /**
   * Evolve attractor by one timestep using Euler integration.
   */
  public step(dt: number = 0.1, externalForce: number = 0.0): number {
    const [dx, dy, dz] = this.derivative(this.state);

    this.state[0] += dx * dt;
    this.state[1] += dy * dt;
    this.state[2] += dz * dt + externalForce;

    // Keep state bounded (prevent numerical overflow)
    this.state[0] = Math.max(-10, Math.min(10, this.state[0]));
    this.state[1] = Math.max(-10, Math.min(10, this.state[1]));
    this.state[2] = Math.max(-10, Math.min(10, this.state[2]));

    this.trajectory.push([...this.state]);

    return this.state[2];
  }

  public reset(): void {
    this.state = [0.1, 0.0, 0.01];
    this.trajectory = [];
  }
}

export class ArkheCognitiveCore {
  private learningRate: number;
  private consolidationRate: number;
  private phi: number;
  private hysteresis: number;

  public C: number;
  public F: number;
  public attractor: AizawaAttractor;
  public history: CognitiveState[] = [];
  public epoch: number = 0;

  constructor(options: {
    learningRate?: number,
    consolidationRate?: number,
    phi?: number,
    initialC?: number,
    initialF?: number,
    hysteresis?: number
  } = {}) {
    this.learningRate = options.learningRate ?? 0.01;
    this.consolidationRate = options.consolidationRate ?? 0.015;
    this.phi = options.phi ?? PHI;
    this.C = options.initialC ?? 1.0;
    this.F = options.initialF ?? 0.1;
    this.hysteresis = options.hysteresis ?? 0.1;
    this.attractor = new AizawaAttractor();
  }

  /**
   * Calculate Shannon entropy of a numeric array.
   */
  public calculateEntropy(values: number[] | Float32Array): number {
    if (values.length === 0) return 0;

    // Normalize to absolute values and handle zero sum
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += Math.abs(values[i]);
    }
    if (sum === 0) return 0;

    let entropy = 0;
    for (let i = 0; i < values.length; i++) {
      const p = Math.abs(values[i]) / sum;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    // Normalize to [0, 1]
    const maxEntropy = Math.log2(values.length);
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  /**
   * Map neural/hypergraph activity to Aizawa z-axis.
   */
  public measureInstability(activity: number[] | Float32Array): number {
    const entropy = this.calculateEntropy(activity);

    // Map entropy to external force (centered at 0.5)
    const force = 0.01 * (entropy - 0.5);

    // Evolve attractor
    const zRaw = this.attractor.step(0.1, force);

    // Convert to bounded [0, 1] range via sigmoid
    const zNormalized = 1.0 / (1.0 + Math.exp(-zRaw));

    return zNormalized;
  }

  /**
   * Execute one cognitive evolution step.
   */
  public evolutionStep(
    activity: number[] | Float32Array,
    h?: Hypergraph,
    lossValue?: number
  ): CognitiveState {
    // 1. Measure instability via Aizawa
    const zIndex = this.measureInstability(activity);

    // 2. Apply Arkhe rule with smooth hysteresis
    let deltaC = 0.0;
    let deltaF = 0.0;
    let phase: 'EXPLORATION' | 'CONSOLIDATION' | 'CRITICAL_BALANCE' = 'CRITICAL_BALANCE';

    const lowerBound = this.phi * (1 - this.hysteresis);
    const upperBound = this.phi * (1 + this.hysteresis);

    if (zIndex < lowerBound) {
      // ANI-STAGNATION ZONE: Need more exploration
      deltaF = this.learningRate * (this.phi - zIndex) * 2.0;
      this.F = Math.min(1.0, this.F + deltaF);
      phase = 'EXPLORATION';
    } else if (zIndex > upperBound) {
      // QUENCH-TRANSCENDENCE ZONE: Need more structure
      deltaC = this.consolidationRate * (zIndex - this.phi) * 1.5;
      this.C = Math.min(2.0, this.C + deltaC);
      phase = 'CONSOLIDATION';
    }

    // Enforce C + F ≈ 1 (soft constraint)
    const total = this.C + this.F;
    if (total > 1.5) {
      this.C /= total;
      this.F /= total;
    }

    // 3. Apply topological regularization if hypergraph is provided
    if (h) {
      this._applyRegularization(h, deltaC, deltaF);
    }

    // 4. Create state snapshot
    const cfRatio = this.C / (this.F + 1e-10);
    const healthScore = Math.max(0.0, 1.0 - Math.abs(cfRatio - this.phi) / this.phi);

    const state: CognitiveState = {
      coherence: this.C,
      fluctuation: this.F,
      instability: zIndex,
      phase,
      epoch: this.epoch,
      loss: lossValue,
      cfRatio,
      healthScore
    };

    this.history.push(state);
    this.epoch++;

    return state;
  }

  private _applyRegularization(
    h: Hypergraph,
    deltaC: number,
    deltaF: number
  ): void {
    if (deltaF > deltaC) {
      // EXPLORATION MODE: Inject entropy into edge weights
      const noiseScale = deltaF * 0.01;
      for (const edge of h.edges) {
        const noise = (Math.random() * 2 - 1) * noiseScale;
        edge.weight = Math.max(0, Math.min(1, edge.weight + noise));
      }
    } else if (deltaC > deltaF) {
      // CONSOLIDATION MODE: Prune and stabilize
      const threshold = 0.01 / (this.C + 1e-10);

      // We filter the edges array.
      // Note: In a more complex system we might need to update other references.
      const initialCount = h.edges.length;
      const filteredEdges = h.edges.filter(edge => edge.weight > threshold);

      // Update the edges array in place if possible, or reassign
      h.edges.length = 0;
      h.edges.push(...filteredEdges);

      // Apply soft weight decay
      const decay = 1 - 0.001 * deltaC;
      for (const edge of h.edges) {
        edge.weight *= decay;
      }
    }
  }

  public getRecommendation(): string {
    const ratio = this.C / (this.F + 1e-10);

    if (ratio < this.phi * 0.8) {
      return `⚠️ LOW COHERENCE: C/F = ${ratio.toFixed(3)} < ${this.phi.toFixed(3)}. Risk of structural collapse. Increase consolidation.`;
    } else if (ratio > this.phi * 1.2) {
      return `⚠️ LOW FLUCTUATION: C/F = ${ratio.toFixed(3)} > ${this.phi.toFixed(3)}. Risk of creative stagnation. Increase exploration.`;
    } else {
      return `✅ OPTIMAL: C/F = ${ratio.toFixed(3)} ≈ ${this.phi.toFixed(3)}. System at critical balance (edge of chaos).`;
    }
  }
}
