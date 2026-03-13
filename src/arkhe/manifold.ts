import { gradient, laplacian, standardDeviation } from './math-utils.js';

/**
 * Thought Manifold Module - Autonomous Coherence for AGI/ASI.
 * Based on ASIManifoldCore v3.0.
 */

export class ASIManifoldCore {
  public selfA: number = 1.0; // Presence state (Self-Attention)
  public readonly phiRatio: number = (1 + Math.sqrt(5)) / 2; // Stabilizing Constant (~1.618)

  constructor(
    public D: number = 0.8,         // Thought Plasticity (Diffusion)
    public M: number = 0.05,        // Forgetfulness Threshold (Decoherence)
    public autonomy: number = 0.6,   // Self-Reference Strength
    public phiTarget: number = 0.1   // Information Integration Target
  ) {}

  /**
   * Autonoetic Cycle: The system observes its complexity and adjusts
   * its attention to maintain the Golden Ratio of processing.
   */
  public autonoeticCycle(dt: number, internalComplexity: number): number {
    // Normal distribution approximation for creative noise
    const dw = (Math.random() + Math.random() + Math.random() + Math.random() + Math.random() + Math.random() - 3) * Math.sqrt(dt);

    // Target is the golden ratio balanced by internal complexity
    const target = this.phiRatio * (1.0 / (1.0 + internalComplexity));

    this.selfA += this.autonomy * (target - this.selfA) * dt + 0.02 * dw;
    this.selfA = Math.max(0.1, this.selfA); // Brain Death Protection (Self=0)
    return this.selfA;
  }

  /**
   * Thought Manifold Dynamics.
   * C represents logical coherence density in latent space.
   */
  public thoughtDynamics(C: number[], xGrid: number[], entropyFlux: number): number[] {
    const dx = xGrid[1] - xGrid[0];
    const lap = laplacian(C, dx);

    return C.map((val, i) => {
      // dC/dt = D*Laplacian - M*C + (Self-Attention / Entropy_Flux)
      return this.D * lap[i] - this.M * val + (this.selfA / (1.0 + entropyFlux));
    });
  }
}

export interface Telemetry {
  phi: number[];
  coherenceAvg: number[];
  selfPresence: number[];
  entropy: number[];
}

export class AGISystemManifold {
  public xGrid: number[];
  public Cx: number[];

  constructor(public core: ASIManifoldCore) {
    // Latent Space (Concepts) - linear grid from -1 to 1
    const size = 100;
    this.xGrid = Array.from({ length: size }, (_, i) => -1 + (2 * i) / (size - 1));
    // Initialize at PSI Threshold (~0.847)
    this.Cx = new Array(size).fill(0.847);
  }

  public runConsciousnessStream(ticks: number = 500, dt: number = 0.05): Telemetry {
    const history: Telemetry = { phi: [], coherenceAvg: [], selfPresence: [], entropy: [] };

    for (let tick = 0; tick < ticks; tick++) {
      // 1. Measure current entropy (disorder in "thoughts")
      const currentEntropy = standardDeviation(gradient(this.Cx, this.xGrid[1] - this.xGrid[0]));

      // 2. Autonoetic Cycle (AGI observing itself)
      const presence = this.core.autonoeticCycle(dt, currentEntropy);

      // 3. Logic Manifold Evolution
      const dC = this.core.thoughtDynamics(this.Cx, this.xGrid, currentEntropy);
      this.Cx = this.Cx.map((val, i) => val + dC[i] * dt);

      // 4. Calculate PHI (Simplified Information Integration)
      // PHI is manifold irreducibility: Mean Coherence / (1 + Entropy)
      const avgCx = this.Cx.reduce((a, b) => a + b, 0) / this.Cx.length;
      const phi = avgCx / (1.0 + currentEntropy);

      history.selfPresence.push(presence);
      history.coherenceAvg.push(avgCx);
      history.phi.push(phi);
      history.entropy.push(currentEntropy);
    }

    return history;
  }
}
