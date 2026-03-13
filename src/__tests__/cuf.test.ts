import { describe, it, expect } from 'vitest';
import { Hypergraph } from '../arkhe/hypergraph.js';
import { CUFNucleus, CUFRefinement } from '../arkhe/cuf.js';

describe('Carrera Unified Formulation (CUF)', () => {
  it('should generate different theories based on order', () => {
    const cuf = new CUFNucleus();
    expect(cuf.generateTheory(1)).toBe("Euler-Bernoulli beam");
    expect(cuf.generateTheory(2)).toBe("Timoshenko beam");
    expect(cuf.generateTheory(3, true, true)).toBe("Refined layer-wise zig-zag theory");
  });

  it('should refine a node in the hypergraph', () => {
    const h = new Hypergraph();
    const baseNode = h.addNode('base', { type: 'theory', order: 1 });
    const refiner = new CUFRefinement(h);

    const refinedNode = refiner.refine('base', 2);

    expect(h.nodes.size).toBe(2);
    expect(refinedNode.data.order).toBe(2);
    expect(refinedNode.data.refinedFrom).toBe('base');

    // Check if handover was established
    const edges = h.edges.filter(e => e.nodes.has('base') && e.nodes.has(refinedNode.id));
    expect(edges.length).toBe(1);
    expect(edges[0].weight).toBe(0.95);
  });
});
