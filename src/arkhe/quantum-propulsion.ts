import { HBAR, CRITICAL_COHERENCE } from './constants.js';
import { gradient, laplacian } from './math-utils.js';

export interface PropulsionResult {
  times: number[];
  sigmas: number[];
  forces: number[];
  totalMomentum: number;
  avgForce: number;
  maxForce: number;
}

/**
 * QuantumHydrodynamicEngine - Propulsion engine based on Madelung hydrodynamics.
 * Implements quantum force via modulation of the Q potential.
 */
export class QuantumHydrodynamicEngine {
  public history = {
    F_q: [] as number[][],
    Q: [] as number[][],
    rho: [] as number[][],
    v: [] as number[][]
  };

  constructor(
    public mass: number = 1e-3, // kg (effective mass)
    public hbar: number = HBAR,
    public coherenceThreshold: number = CRITICAL_COHERENCE
  ) {}

  /**
   * Calculates Q = - (ħ²/2m) (∇²√ρ)/√ρ
   */
  public computeQuantumPotential(rho: number[], dx: number): number[] {
    const sqrtRho = rho.map(val => Math.sqrt(Math.max(val, 1e-10)));
    const lapSqrtRho = laplacian(sqrtRho, dx);

    return sqrtRho.map((val, i) => {
      return - (Math.pow(this.hbar, 2) / (2 * this.mass)) * (lapSqrtRho[i] / val);
    });
  }

  /**
   * Calculates F_Q = -∇Q
   */
  public computeQuantumForce(Q: number[], dx: number): number[] {
    const gradQ = gradient(Q, dx);
    return gradQ.map(val => -val);
  }

  /**
   * Evolves a Gaussian packet and calculates the quantum force.
   */
  public evolveGaussianPacket(
    sigma0: number,
    x0: number,
    v0: number,
    t: number,
    numPoints: number = 1000,
    xRange: [number, number] = [-10, 10]
  ): { x: number[], rho: number[], F_q: number[], Q: number[], v: number[] } {
    const x = Array.from({ length: numPoints }, (_, i) => xRange[0] + (xRange[1] - xRange[0]) * i / (numPoints - 1));
    const dx = x[1] - x[0];

    // Gaussian packet with dispersion
    const sigma_t = sigma0 * Math.sqrt(1 + Math.pow((this.hbar * t) / (2 * this.mass * Math.pow(sigma0, 2)), 2));
    const rho = x.map(xi => {
      return (1 / (Math.sqrt(2 * Math.PI) * sigma_t)) * Math.exp(-Math.pow(xi - x0 - v0 * t, 2) / (2 * Math.pow(sigma_t, 2)));
    });

    const Q = this.computeQuantumPotential(rho, dx);
    const F_q = this.computeQuantumForce(Q, dx);

    // Phase velocity (group)
    const v = x.map(xi => {
      return v0 + (this.hbar / (2 * this.mass * Math.pow(sigma_t, 2))) * (xi - x0 - v0 * t);
    });

    this.history.F_q.push(F_q);
    this.history.Q.push(Q);
    this.history.rho.push(rho);
    this.history.v.push(v);

    return { x, rho, F_q, Q, v };
  }

  /**
   * Calculates coherence C = 1 - S/S_max, where S is Shannon entropy of the probability density.
   */
  public computeCoherence(rho: number[], dx: number): number {
    const sumRho = rho.reduce((a, b) => a + b, 0);
    const rhoNorm = rho.map(val => val / (sumRho * dx));

    let entropy = 0;
    for (const p of rhoNorm) {
      if (p > 1e-10) {
        entropy -= p * Math.log(p) * dx;
      }
    }

    const sMax = Math.log(rho.length);
    const C = 1 - entropy / sMax;
    return Math.max(0, Math.min(1, C));
  }

  /**
   * Simulates propulsion via periodic modulation of the packet width.
   */
  public modulateForPropulsion(
    baseSigma: number,
    modulationFreq: number,
    modulationAmp: number,
    duration: number,
    dt: number = 0.01
  ): PropulsionResult {
    const numSteps = Math.floor(duration / dt);
    const times = Array.from({ length: numSteps }, (_, i) => i * dt);

    // Modulation: sigma(t) = sigma0 * (1 + A*sin(ωt))
    const sigmas = times.map(t => baseSigma * (1 + modulationAmp * Math.sin(2 * Math.PI * modulationFreq * t)));

    let totalMomentum = 0;
    const forcesCenter: number[] = [];

    for (let i = 0; i < numSteps; i++) {
      let dSigmaDt = 0;
      if (i > 0 && i < numSteps - 1) {
        dSigmaDt = (sigmas[i + 1] - sigmas[i - 1]) / (2 * dt);
      }

      const sigma = sigmas[i];
      // Quantum force at center for Gaussian packet: F = (ħ²/2mσ³) * dσ/dt
      const F_center = (Math.pow(this.hbar, 2) / (2 * this.mass * Math.pow(sigma, 3))) * dSigmaDt;
      forcesCenter.push(F_center);

      totalMomentum += F_center * dt;
    }

    return {
      times,
      sigmas,
      forces: forcesCenter,
      totalMomentum,
      avgForce: forcesCenter.reduce((a, b) => a + b, 0) / numSteps,
      maxForce: Math.max(...forcesCenter.map(Math.abs))
    };
  }
}
