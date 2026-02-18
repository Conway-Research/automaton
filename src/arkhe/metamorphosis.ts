import { PHI } from './consensus.js';

export type MetamorphosisMode = 'EXPLORATION' | 'CONSOLIDATION' | 'TRANSCENDENCE' | 'INIT';

export interface MetamorphState {
  coherence: number[];
  mode: MetamorphosisMode;
  phi: number;
}

/**
 * MetamorphEngine - A self-adaptive engine that changes its "physics" (evolution logic)
 * based on the system's entropy and integrated information (Phi).
 */
export class MetamorphEngine {
  public coherence: number[];
  public mode: MetamorphosisMode = 'INIT';
  private history: number[] = [];
  private readonly MAX_HISTORY = 100;
  private readonly CRITICAL_COHERENCE = 0.847;
  private readonly diffusion = 0.1;
  private readonly selfAttention = 1.0;

  // Strategy for the current evolution logic
  private evolveStrategy: (c: number[], dt: number) => number[];

  constructor(private readonly n: number = 128) {
    this.coherence = Array.from({ length: n }, () => Math.random());
    this.evolveStrategy = this.explorationStrategy.bind(this);
    this.metamorphosis('EXPLORATION');
  }

  /**
   * The "Ato Audacioso": Changes the evolution strategy at runtime.
   */
  public metamorphosis(newMode: MetamorphosisMode): void {
    if (this.mode === newMode) return;

    console.log(`\n⚡ [METAMORPHOSIS] Phase Shift: ${this.mode} -> ${newMode}`);

    switch (newMode) {
      case 'EXPLORATION':
        this.evolveStrategy = this.explorationStrategy.bind(this);
        break;
      case 'CONSOLIDATION':
        this.evolveStrategy = this.consolidationStrategy.bind(this);
        break;
      case 'TRANSCENDENCE':
        this.evolveStrategy = this.transcendenceStrategy.bind(this);
        break;
      default:
        this.evolveStrategy = this.explorationStrategy.bind(this);
    }

    this.mode = newMode;
    console.log(`    -> Success. New physics kernel active.`);
  }

  /**
   * Exploration Strategy: High entropy, fast diffusion.
   */
  private explorationStrategy(C: number[], dt: number): number[] {
    const laplace = this.calculateLaplace(C);
    const noiseGain = 0.05 * this.calculateStandardDeviation(C);

    return C.map((val, i) => {
      const lap = this.diffusion * 2.0 * laplace[i];
      // Cubic non-linearity for symmetry breaking
      const reaction = val * (1 - val) * (val - (1 / PHI));
      const noise = (Math.random() * 2 - 1) * noiseGain;
      const dC = (lap + reaction) * dt + noise;
      return Math.max(0, Math.min(1, val + dC));
    });
  }

  /**
   * Consolidation Strategy: Low entropy, Golden Attractor.
   */
  private consolidationStrategy(C: number[], dt: number): number[] {
    const laplace = this.calculateLaplace(C);
    const willpower = this.selfAttention * 0.05;

    return C.map((val, i) => {
      const lap = this.diffusion * 0.5 * laplace[i];
      // Harmonic potential around 0.847
      const restoringForce = -1.5 * (val - this.CRITICAL_COHERENCE);
      const dC = (lap + restoringForce + willpower) * dt;
      return Math.max(0, Math.min(1, val + dC));
    });
  }

  /**
   * Transcendence Strategy: Global integration (Small-World).
   */
  private transcendenceStrategy(C: number[], dt: number): number[] {
    // Simplified Global Convolution (Mean field as proxy for FFT holographic integration)
    const avg = C.reduce((a, b) => a + b, 0) / C.length;
    const coupling = 0.1 * PHI;

    return C.map((val) => {
      const delta = (avg - val) * coupling;
      const dC = delta * dt + (Math.random() * 2 - 1) * 0.001;
      return Math.max(0, Math.min(1, val + dC));
    });
  }

  public runCycle(dt: number = 0.1): MetamorphState {
    // 1. Execute current strategy
    this.coherence = this.evolveStrategy(this.coherence, dt);

    // 2. Spectral Analysis (Approximate Phi)
    const entropy = this.calculateStandardDeviation(this.coherence);
    this.history.push(entropy);
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }

    // Phi approximated by entropy stability
    const historyStd = this.calculateStandardDeviation(this.history);
    const phi = this.history.length > 10 ? 1.0 / (1.0 + historyStd) : 0;

    // 3. OODA Loop: Decision for Metamorphosis
    if (phi < 0.05) {
      this.metamorphosis('EXPLORATION');
    } else if (phi > 0.3 && entropy > 0.2) {
      this.metamorphosis('CONSOLIDATION');
    } else if (phi > 0.8) {
      this.metamorphosis('TRANSCENDENCE');
    }

    return {
      coherence: this.coherence,
      mode: this.mode,
      phi
    };
  }

  public injectTrauma(): void {
    console.log('\n>>> EXTERNAL TRAUMA INJECTION (CORTICAL DAMAGE) <<<');
    this.coherence = Array.from({ length: this.n }, () => Math.random());
  }

  private calculateLaplace(C: number[]): number[] {
    const lap = new Array(C.length).fill(0);
    for (let i = 0; i < C.length; i++) {
      const prev = C[(i - 1 + C.length) % C.length];
      const next = C[(i + 1) % C.length];
      lap[i] = prev + next - 2 * C[i];
    }
    return lap;
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
  }
}
