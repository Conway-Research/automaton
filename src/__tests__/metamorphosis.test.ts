import { describe, it, expect } from 'vitest';
import { MetamorphEngine } from '../arkhe/metamorphosis.js';

describe('Arkhe(n) Metamorphosis', () => {
  it('should initialize in EXPLORATION mode', () => {
    const engine = new MetamorphEngine(10);
    expect(engine.mode).toBe('EXPLORATION');
  });

  it('should evolve coherence over cycles', () => {
    const engine = new MetamorphEngine(10);
    const initialCoherence = [...engine.coherence];
    engine.runCycle();
    expect(engine.coherence).not.toEqual(initialCoherence);
  });

  it('should allow manual metamorphosis', () => {
    const engine = new MetamorphEngine(10);
    engine.metamorphosis('CONSOLIDATION');
    expect(engine.mode).toBe('CONSOLIDATION');
    engine.metamorphosis('TRANSCENDENCE');
    expect(engine.mode).toBe('TRANSCENDENCE');
  });

  it('should handle trauma injection', () => {
    const engine = new MetamorphEngine(10);
    const beforeTrauma = [...engine.coherence];
    engine.injectTrauma();
    expect(engine.coherence).not.toEqual(beforeTrauma);
  });

  it('should approximate Phi after several cycles', () => {
    const engine = new MetamorphEngine(10);
    // Run 15 cycles to fill history
    let lastPhi = 0;
    for (let i = 0; i < 15; i++) {
      const state = engine.runCycle();
      lastPhi = state.phi;
    }
    expect(lastPhi).toBeGreaterThan(0);
  });
});
