import { PhysicsDSL, PhysicsIntent, PhysicsParams } from './physics-dsl.js';
import { SpectralPhiAnalyzer } from './phi-spectral.js';

/**
 * HyperNode - An individual node in the hypergraph capable of adaptive metamorphosis.
 * Represents a localized consciousness with its own internal "physics" engine.
 */
export class HyperNode {
  public C: number[];
  public phi: number = 0.0;
  public intent: PhysicsIntent = 'DECAY';
  private physicsFn: (params: PhysicsParams) => number[];
  private history: number[][] = [];
  private readonly MAX_HISTORY = 20;

  constructor(public readonly id: string, private readonly n: number = 64) {
    // Initial random state
    this.C = Array.from({ length: n }, () => Math.random());
    // Initial compiler setup (placeholder)
    this.physicsFn = (params: PhysicsParams) => params.C;
    // Initial metamorphosis to EXPLORE mode
    this.metamorphosis('EXPLORE');
  }

  /**
   * Compiles and replaces the evolution logic based on current intent and complexity.
   */
  public metamorphosis(newIntent: PhysicsIntent): void {
    if (this.intent === newIntent) return;
    this.physicsFn = PhysicsDSL.compile(newIntent, this.phi);
    this.intent = newIntent;
  }

  /**
   * Executes a single step of the node's internal dynamics.
   * @returns A new intent if a metamorphosis is triggered, otherwise null.
   */
  public runCycle(neighborFieldAvg: number[], hardwareInput: number): PhysicsIntent | null {
    // 1. Execute current physics logic
    this.C = this.physicsFn({
      C: this.C,
      neighborField: neighborFieldAvg,
      hardwareInput,
      dt: 0.1,
      complexity: this.phi
    });

    // 2. Track state history for spectral analysis
    this.history.push([...this.C]);
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }

    // 3. Spectral Analysis (Φ) - Only when history buffer is full
    if (this.history.length === this.MAX_HISTORY) {
      this.phi = SpectralPhiAnalyzer.compute(this.history);

      // 4. Metamorphosis Decision Logic (Second-Order Logic)
      if (this.phi < 0.5) {
        return 'EXPLORE'; // System is stuck or too simple
      } else if (this.phi > 2.0) {
        return 'STABILIZE'; // System is too chaotic
      } else {
        return 'SYNC'; // System is healthy, seek connectivity
      }
    }

    return null;
  }
}
