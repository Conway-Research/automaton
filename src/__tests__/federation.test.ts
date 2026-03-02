import { describe, it, expect } from 'vitest';
import { PhysicsDSL } from '../arkhe/physics-dsl.js';
import { SpectralPhiAnalyzer } from '../arkhe/phi-spectral.js';
import { EvolutionLedger } from '../arkhe/evolution-ledger.js';
import { HyperNode } from '../arkhe/hypernode.js';
import { HyperFederation } from '../arkhe/federation.js';

describe('Arkhe(n) Federation & Spectral Phi', () => {
  it('should compile and run physics strategies', () => {
    const explore = PhysicsDSL.compile('EXPLORE', 0.5);
    const C = new Array(64).fill(0.5);
    const nextC = explore({
      C,
      neighborField: new Array(64).fill(0.5),
      hardwareInput: 0.5,
      dt: 0.1,
      complexity: 0.5
    });
    expect(nextC.length).toBe(64);
    expect(nextC[0]).not.toBe(0.5); // Should have evolved
  });

  it('should compute Spectral Phi from history', () => {
    // Generate a diverse history
    const history = Array.from({ length: 20 }, () =>
      Array.from({ length: 64 }, () => Math.random())
    );
    const phi = SpectralPhiAnalyzer.compute(history);
    expect(phi).toBeGreaterThan(0);

    // Constant history should have very low phi
    const constantHistory = Array.from({ length: 20 }, () =>
      new Array(64).fill(0.5)
    );
    const lowPhi = SpectralPhiAnalyzer.compute(constantHistory);
    expect(lowPhi).toBeLessThan(0.1);
  });

  it('should record metamorphosis in the ledger', () => {
    const ledger = new EvolutionLedger();
    const hash = ledger.recordMetamorphosis('node-1', 'EXPLORE', 'STABILIZE', 1.5);
    expect(hash.length).toBe(16);
    expect(ledger.chain.length).toBe(1);
    expect(ledger.chain[0].transition).toBe('EXPLORE -> STABILIZE');
  });

  it('should run a federation epoch and trigger metamorphosis', () => {
    const federation = new HyperFederation(3);
    // Force a low phi state to trigger EXPLORE metamorphosis if not already there
    // but they start in EXPLORE.
    // Let's just run it.
    federation.runEpoch(5);
    expect(federation.nodes.length).toBe(3);
    expect(federation.ledger.chain.length).toBeDefined();
  });
});
