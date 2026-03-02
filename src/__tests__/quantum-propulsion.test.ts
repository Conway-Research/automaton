import { describe, it, expect } from 'vitest';
import { QuantumHydrodynamicEngine } from '../arkhe/quantum-propulsion.js';

describe('Quantum Hydrodynamic Propulsion', () => {
  it('should compute quantum potential for a Gaussian packet', () => {
    const engine = new QuantumHydrodynamicEngine(1.0);
    const x = Array.from({ length: 100 }, (_, i) => -5 + 0.1 * i);
    const dx = 0.1;
    const sigma = 0.5; // Wider packet for numerical stability with dx=0.1
    const rho = x.map(xi => (1 / (Math.sqrt(2 * Math.PI) * sigma)) * Math.exp(-Math.pow(xi, 2) / (2 * Math.pow(sigma, 2))));

    const Q = engine.computeQuantumPotential(rho, dx);
    expect(Q.length).toBe(100);
    // At center x=0, Q should be non-zero and follow the analytic peak
    expect(Math.abs(Q[50])).toBeGreaterThan(0);
  });

  it('should calculate non-zero momentum during modulation', () => {
    const engine = new QuantumHydrodynamicEngine(1e-6);
    const result = engine.modulateForPropulsion(
      1e-6, // base sigma
      1e4,  // 10kHz
      0.1,  // 10%
      0.01, // 10ms
      1e-4  // 0.1ms dt
    );

    expect(result.totalMomentum).not.toBe(0);
    expect(result.avgForce).toBeDefined();
    expect(result.maxForce).toBeGreaterThan(0);
  });

  it('should evolve Gaussian packet and track history', () => {
    const engine = new QuantumHydrodynamicEngine(1e-6);
    engine.evolveGaussianPacket(1e-6, 0, 0, 1e-3);

    expect(engine.history.rho.length).toBe(1);
    expect(engine.history.F_q.length).toBe(1);
    expect(engine.history.Q.length).toBe(1);
  });

  it('should compute coherence correctly', () => {
    const engine = new QuantumHydrodynamicEngine(1.0);
    const x = Array.from({ length: 100 }, (_, i) => -5 + 0.1 * i);
    const dx = 0.1;
    const sigma = 0.5;
    const rho = x.map(xi => (1 / (Math.sqrt(2 * Math.PI) * sigma)) * Math.exp(-Math.pow(xi, 2) / (2 * Math.pow(sigma, 2))));

    const C = engine.computeCoherence(rho, dx);
    expect(C).toBeGreaterThan(0);
    expect(C).toBeLessThanOrEqual(1.0);
  });
});
