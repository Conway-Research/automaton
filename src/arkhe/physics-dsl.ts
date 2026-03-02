export type PhysicsIntent = 'EXPLORE' | 'STABILIZE' | 'SYNC' | 'DECAY';

export interface PhysicsParams {
  C: number[];
  neighborField: number[];
  hardwareInput: number;
  dt: number;
  complexity: number;
}

/**
 * PhysicsDSL - Translates abstract intent into executable evolution logic.
 * Ensures stability and topological protection.
 */
import { PHI, INV_PHI } from './constants.js';

export class PhysicsDSL {
  public static compile(intent: PhysicsIntent, complexity: number): (params: PhysicsParams) => number[] {
    switch (intent) {
      case 'EXPLORE':
        return (params: PhysicsParams) => {
          const { C, neighborField, dt } = params;
          const laplace = this.calculateLaplace(C);
          const noiseGain = 0.1 * complexity;

          return C.map((val, i) => {
            const diff = 0.5 * laplace[i];
            const reaction = 3.8 * val * (1.0 - val) - val; // Logistic Map logic
            const coupling = (neighborField[i] - val) * 0.05;
            const noise = (Math.random() * 2 - 1) * noiseGain;
            const dC = (diff + reaction + coupling) * dt + noise;
            return Math.max(0, Math.min(1, val + dC));
          });
        };

      case 'STABILIZE':
        return (params: PhysicsParams) => {
          const { C, neighborField, dt } = params;
          const laplace = this.calculateLaplace(C);
          const target = INV_PHI; // Golden Attractor (0.618)

          return C.map((val, i) => {
            const diff = 0.2 * laplace[i];
            const restoring = -1.5 * (val - target);
            const coupling = (neighborField[i] - val) * 0.2; // Stronger coupling for stability
            const dC = (diff + restoring + coupling) * dt;
            return Math.max(0, Math.min(1, val + dC));
          });
        };

      case 'SYNC':
        return (params: PhysicsParams) => {
          const { C, neighborField, hardwareInput, dt } = params;
          const laplace = this.calculateLaplace(C);

          return C.map((val, i) => {
            const diff = 0.1 * laplace[i];
            // Kuramoto-like phase synchronization
            const syncForce = Math.sin(neighborField[i] - val);
            const inputDrive = hardwareInput * 0.1;
            const dC = (diff + syncForce + inputDrive) * dt;
            return Math.max(0, Math.min(1, val + dC));
          });
        };

      default:
        return (params: PhysicsParams) => {
          const { C, dt } = params;
          return C.map(val => Math.max(0, val - 0.1 * val * dt));
        };
    }
  }

  private static calculateLaplace(C: number[]): number[] {
    const lap = new Array(C.length).fill(0);
    for (let i = 0; i < C.length; i++) {
      const prev = C[(i - 1 + C.length) % C.length];
      const next = C[(i + 1) % C.length];
      lap[i] = prev + next - 2 * C[i];
    }
    return lap;
  }
}
