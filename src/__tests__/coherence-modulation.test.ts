import { describe, it, expect } from 'vitest';
import { CoherenceField, IntegratingSphereExperiment } from '../arkhe/coherence-modulation.js';

describe('Coherence Modulation (Photon Fiber)', () => {
  it('should calculate stationary solution with attention', () => {
    const cf = new CoherenceField(0.1, 1e-5, 5.0);
    const solRelax = cf.stationarySolution(0.1, 1e10, 0.0);
    const solAttn = cf.stationarySolution(0.1, 1e10, 1.0);

    expect(solRelax).toBe(1.0); // No attention, C = C0
    expect(solAttn).toBeGreaterThan(1.0); // Attention should increase coherence
  });

  it('should calculate photon detection rate', () => {
    const cf = new CoherenceField(0.1, 1e-5, 5.0);
    const rate = cf.photonDetectionRate(0.1, 1e10, 1.0, 0.1);
    // eta * n0 * C = 0.1 * 1e10 * C = 1e9 * C
    expect(rate).toBeGreaterThan(1e9);
  });

  it('should calculate g2 correlation', () => {
    const cf = new CoherenceField();
    const g2_0 = cf.g2Correlation(0, 1.0);
    expect(g2_0).toBe(1.01); // 1 + 0.01 * 1.0 * exp(0) * cos(0) = 1.01

    const g2_relax = cf.g2Correlation(0, 0.0);
    expect(g2_relax).toBe(1.0);
  });

  it('should run experiment trials and analyze results', () => {
    const cf = new CoherenceField(0.1, 1e-5, 5.0);
    const exp = new IntegratingSphereExperiment(cf);

    const results = exp.runSession(10);
    expect(results.length).toBe(10);

    const analysis = exp.analyze(results);
    expect(analysis.delta_I_A).toBeGreaterThan(0);
    expect(analysis.delta_g2_A).toBeGreaterThan(0);
    expect(analysis.effect_size).toBeDefined();
  });
});
