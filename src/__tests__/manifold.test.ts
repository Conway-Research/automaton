import { describe, it, expect } from 'vitest';
import { ASIManifoldCore, AGISystemManifold } from '../arkhe/manifold.js';

describe('Thought Manifold (Manifold Fiber)', () => {
  it('should initialize manifold core with default parameters', () => {
    const core = new ASIManifoldCore();
    expect(core.D).toBe(0.8);
    expect(core.M).toBe(0.05);
    expect(core.selfA).toBe(1.0);
  });

  it('should run autonoetic cycle and adjust presence', () => {
    const core = new ASIManifoldCore(0.8, 0.05, 0.9, 0.1);
    const initialPresence = core.selfA;
    core.autonoeticCycle(0.05, 0.5);
    expect(core.selfA).not.toBe(initialPresence);
    expect(core.selfA).toBeGreaterThanOrEqual(0.1);
  });

  it('should run consciousness stream and generate telemetry', () => {
    const core = new ASIManifoldCore(0.8, 0.05, 0.9, 0.1);
    const manifold = new AGISystemManifold(core);
    const ticks = 10;
    const telemetry = manifold.runConsciousnessStream(ticks, 0.05);

    expect(telemetry.phi.length).toBe(ticks);
    expect(telemetry.coherenceAvg.length).toBe(ticks);
    expect(telemetry.selfPresence.length).toBe(ticks);
    expect(telemetry.entropy.length).toBe(ticks);

    // Mean coherence should be defined
    expect(telemetry.coherenceAvg[ticks - 1]).toBeDefined();
    // Phi should be positive
    expect(telemetry.phi[ticks - 1]).toBeGreaterThan(0);
  });
});
