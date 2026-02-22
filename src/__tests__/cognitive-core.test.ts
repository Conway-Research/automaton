import { describe, it, expect } from 'vitest';
import { ArkheCognitiveCore, AizawaAttractor } from '../arkhe/cognitive-core.js';
import { Hypergraph } from '../arkhe/hypergraph.js';
import { PHI } from '../arkhe/constants.js';

describe('AizawaAttractor', () => {
  it('should evolve state over time', () => {
    const attractor = new AizawaAttractor();
    const initialZ = attractor.state[2];

    attractor.step(0.1);
    expect(attractor.state[2]).not.toBe(initialZ);
    expect(attractor.trajectory.length).toBe(1);
  });

  it('should remain bounded', () => {
    const attractor = new AizawaAttractor();
    for (let i = 0; i < 100; i++) {
      attractor.step(0.1, 1.0); // Push it with force
    }
    expect(attractor.state[0]).toBeLessThanOrEqual(10);
    expect(attractor.state[0]).toBeGreaterThanOrEqual(-10);
    expect(attractor.state[2]).toBeLessThanOrEqual(10);
  });
});

describe('ArkheCognitiveCore', () => {
  it('should calculate entropy correctly', () => {
    const core = new ArkheCognitiveCore();
    const lowEntropy = [1, 0, 0, 0];
    const highEntropy = [1, 1, 1, 1];

    expect(core.calculateEntropy(lowEntropy)).toBe(0);
    expect(core.calculateEntropy(highEntropy)).toBeCloseTo(1.0, 5);
  });

  it('should transition to EXPLORATION when instability is low', () => {
    const core = new ArkheCognitiveCore({ phi: 0.6, initialF: 0.1 });
    // To get low instability, we need zIndex < lowerBound.
    // zIndex is sigmoid(zRaw). lowerBound ≈ 0.6 * 0.9 = 0.54.
    // So we need zRaw < logit(0.54).

    // We can just mock measureInstability if we want to be sure,
    // but let's try to run a few steps with low entropy activity.
    let state;
    for (let i = 0; i < 50; i++) {
      state = core.evolutionStep([1, 0, 0, 0]); // Low entropy
      if (state.phase === 'EXPLORATION') break;
    }

    expect(core.history.some(s => s.phase === 'EXPLORATION')).toBe(true);
  });

  it('should transition to CONSOLIDATION when instability is high', () => {
    const core = new ArkheCognitiveCore({ phi: 0.6, initialC: 0.1 });
    let state;
    for (let i = 0; i < 50; i++) {
      state = core.evolutionStep([0.5, 0.5, 0.5, 0.5]); // High entropy
      if (state.phase === 'CONSOLIDATION') break;
    }

    expect(core.history.some(s => s.phase === 'CONSOLIDATION')).toBe(true);
  });

  it('should apply regularization to Hypergraph', () => {
    const h = new Hypergraph();
    h.addNode('n1');
    h.addNode('n2');
    h.addEdge(new Set(['n1', 'n2']), 0.5);

    const core = new ArkheCognitiveCore();

    // Force CONSOLIDATION by setting a very low phi and providing high entropy
    const coreCons = new ArkheCognitiveCore({ phi: 0.1, initialC: 1.0 });
    coreCons.evolutionStep([0.5, 0.5, 0.5, 0.5], h);

    // In consolidation, it might prune or decay.
    // Since we only have one edge with weight 0.5, and threshold is 0.01 / C,
    // it shouldn't be pruned if C is around 1.0. But it should decay.
    expect(h.edges[0].weight).toBeLessThan(0.5);

    // Force EXPLORATION
    const coreExpl = new ArkheCognitiveCore({ phi: 0.9, initialF: 0.1 });
    const initialWeight = h.edges[0].weight;
    coreExpl.evolutionStep([1, 0, 0, 0], h);

    // In exploration, it adds noise.
    expect(h.edges[0].weight).not.toBe(initialWeight);
  });
});
