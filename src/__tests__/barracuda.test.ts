import { describe, it, expect } from 'vitest';
import { Hypergraph } from '../arkhe/hypergraph.js';
import { BarraCUDACompiler } from '../arkhe/barracuda.js';
import { SiliconConstitution } from '../arkhe/constitution.js';

describe('BarraCUDA Integration', () => {
  it('should simulate compilation pipeline', () => {
    const h = new Hypergraph();
    const compiler = new BarraCUDACompiler(h);

    compiler.compile('vector_add', 10);

    expect(h.nodes.size).toBe(12); // 11 stages + 1 validator
    expect(h.edges.filter(e => e.type === 'compilation_handover').length).toBe(10);
    expect(h.edges.filter(e => e.type === 'validation_witness').length).toBe(1);

    expect(h.totalCoherence()).toBeGreaterThan(0.9);
  });

  it('should estimate occupancy for GFX11', () => {
    const h = new Hypergraph();
    const compiler = new BarraCUDACompiler(h);

    // Wave32, 32 VGPRs, 64 SGPRs
    const occupancy = compiler.estimateOccupancy(32, 64);
    expect(occupancy).toBe(8); // min(256/32, 1024/64) = min(8, 16) = 8
  });

  it('should validate binary encoding constraints', () => {
    const h = new Hypergraph();
    const compiler = new BarraCUDACompiler(h);

    // SOP1 prefix 0xBE800000
    expect(compiler.validateEncoding(0xBE800001, 'SOP1')).toBe(true);
    expect(compiler.validateEncoding(0xAE800001, 'SOP1')).toBe(false);

    // SOPC prefix 0xBF000000
    expect(compiler.validateEncoding(0xBF000001, 'SOPC')).toBe(true);
  });

  it('should satisfy Silicon Constitution Article 18', () => {
    const h = new Hypergraph();
    const compiler = new BarraCUDACompiler(h);
    const constitution = new SiliconConstitution(h);

    compiler.compile('test_kernel');

    const audit = constitution.audit();
    expect(audit.violations.some(v => v.article === 18)).toBe(false);
  });
});
