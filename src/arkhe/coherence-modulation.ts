/**
 * Coherence Modulation Module - Photon Detection and Attention.
 * Based on the Integrating Sphere Experiment.
 */

export class CoherenceField {
  public C0: number = 1.0; // Background coherence

  constructor(
    public M: number = 0.1,    // Effective coherence mass [1/cm]
    public lam: number = 1e-6, // Coupling constant
    public R: number = 5.0     // Sphere radius [cm]
  ) {}

  /**
   * Stationary solution with attention modulation.
   */
  public stationarySolution(r: number, n0: number, mAttn: number): number {
    const x = this.M * r;
    const xR = this.M * this.R;

    // Particular solution
    const cPart = (this.lam * n0) / (this.M * this.M);

    // Spherical Green function (approximated as sinh(x)/x)
    const G = x > 0 ? Math.sinh(x) / x : 1.0;
    const GR = Math.sinh(xR) / xR;

    return this.C0 + cPart * mAttn * (1 - G / GR);
  }

  /**
   * Photon detection rate proportional to C(r) * n0.
   */
  public photonDetectionRate(r: number, n0: number, mAttn: number, eta: number = 0.1): number {
    const C = this.stationarySolution(r, n0, mAttn);
    return eta * n0 * C;
  }

  /**
   * g^(2)(tau) correlation function modified by attention.
   */
  public g2Correlation(tau: number, mAttn: number, tCoherence: number = 1e-6): number {
    // Effective temporal coherence altered by attention
    const tEff = tCoherence * (1 + 0.1 * mAttn);

    // For coherent light, g^(2)(tau) = 1, with attention modulation:
    return 1 + 0.01 * mAttn * Math.exp(-tau / tEff) * Math.cos((2 * Math.PI * tau) / tEff);
  }
}

export interface TrialResult {
  I_A: number;
  I_B: number;
  g2_A_0: number;
  g2_B_0: number;
  rho_AB: number;
  attention: number;
}

export class IntegratingSphereExperiment {
  public n0: number = 1e10; // Photon density [photons/cm^3]

  constructor(public coherenceField: CoherenceField) {}

  /**
   * Runs a single experimental trial.
   */
  public runTrial(attentionLevel: number): TrialResult {
    // Sensor A: optical axis (r=0.1)
    const I_A = this.coherenceField.photonDetectionRate(0.1, this.n0, attentionLevel);

    // Sensor B: surface (r=R)
    const I_B = this.coherenceField.photonDetectionRate(this.coherenceField.R, this.n0, attentionLevel);

    // g2 at tau=0
    const g2_A_0 = this.coherenceField.g2Correlation(0, attentionLevel);
    const g2_B_0 = this.coherenceField.g2Correlation(0, attentionLevel * 0.8);

    // Simplified correlation between sensors A and B
    // In a real simulation, we'd sample from Poisson
    const samplesA = Array.from({ length: 100 }, () => this.poissonRandom(I_A / 1e8)); // scaled for stability
    const samplesB = Array.from({ length: 100 }, () => this.poissonRandom(I_B / 1e8));
    const rho_AB = this.correlationCoefficient(samplesA, samplesB);

    return {
      I_A,
      I_B,
      g2_A_0,
      g2_B_0,
      rho_AB,
      attention: attentionLevel,
    };
  }

  /**
   * Runs a session with multiple trials.
   */
  public runSession(nTrials: number = 100): TrialResult[] {
    const results: TrialResult[] = [];
    for (let i = 0; i < nTrials; i++) {
      const m = i % 2 === 0 ? 1.0 : 0.0; // Alternate ATTENTION vs RELAX
      results.push(this.runTrial(m));
    }
    return results;
  }

  /**
   * Statistical analysis of results.
   */
  public analyze(results: TrialResult[]) {
    const att = results.filter((r) => r.attention === 1.0);
    const rel = results.filter((r) => r.attention === 0.0);

    const meanIA_att = this.mean(att.map((r) => r.I_A));
    const meanIA_rel = this.mean(rel.map((r) => r.I_A));
    const meanIB_att = this.mean(att.map((r) => r.I_B));
    const meanIB_rel = this.mean(rel.map((r) => r.I_B));
    const meanG2A_att = this.mean(att.map((r) => r.g2_A_0));
    const meanG2A_rel = this.mean(rel.map((r) => r.g2_A_0));

    return {
      delta_I_A: meanIA_att - meanIA_rel,
      delta_I_B: meanIB_att - meanIB_rel,
      delta_g2_A: meanG2A_att - meanG2A_rel,
      rho_AB_att: this.mean(att.map((r) => r.rho_AB)),
      rho_AB_rel: this.mean(rel.map((r) => r.rho_AB)),
      effect_size: (meanIA_att - meanIA_rel) / (this.std(rel.map((r) => r.I_A)) || 1e-9),
    };
  }

  private poissonRandom(lambda: number): number {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= Math.random();
    } while (p > L);
    return k - 1;
  }

  private mean(arr: number[]): number {
    return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private std(arr: number[]): number {
    const mu = this.mean(arr);
    const variance = arr.reduce((a, b) => a + Math.pow(b - mu, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  private correlationCoefficient(x: number[], y: number[]): number {
    const muX = this.mean(x);
    const muY = this.mean(y);
    const n = x.length;
    let num = 0;
    let denX = 0;
    let denY = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - muX) * (y[i] - muY);
      denX += Math.pow(x[i] - muX, 2);
      denY += Math.pow(y[i] - muY, 2);
    }
    const den = Math.sqrt(denX * denY);
    return den === 0 ? 0 : num / den;
  }
}
