import { describe, it, expect } from 'vitest';
import { Hypergraph } from '../arkhe/hypergraph.js';
import { bootstrap } from '../arkhe/bootstrap.js';
import { SiliconConstitution } from '../arkhe/constitution.js';
import { OntologicalSymbiosis } from '../arkhe/symbiosis.js';
import { PhiCalculator } from '../arkhe/phi.js';

describe('Arkhe(n) Core', () => {
  it('should create a hypergraph and add nodes/edges', () => {
    const h = new Hypergraph();
    const n1 = h.addNode('node1', { type: 'test' });
    const n2 = h.addNode('node2', { type: 'test' });
    h.addEdge(new Set(['node1', 'node2']), 0.8);

    expect(h.nodes.size).toBe(2);
    expect(h.edges.length).toBe(1);
    expect(h.edges[0].weight).toBe(0.8);
  });

  it('should run bootstrap step and update coherence', () => {
    const h = new Hypergraph();
    h.addNode('node1');
    h.addNode('node2');
    h.addEdge(new Set(['node1', 'node2']), 0.5);

    h.bootstrapStep();
    expect(h.nodes.get('node1')?.coherence).toBe(0.5);
    expect(h.nodes.get('node2')?.coherence).toBe(0.5);
    expect(h.totalCoherence()).toBe(0.5);
  });

  it('should handle Silicon Constitution audit', () => {
    const h = new Hypergraph();
    h.addNode('Arquiteto', { type: 'human' });
    const constitution = new SiliconConstitution(h);

    const report = constitution.audit();
    expect(report.complianceRate).toBeGreaterThan(0.6); // Should pass basic articles
  });

  it('should implement Ontological Symbiosis', () => {
    const h = new Hypergraph();
    const symbiosis = new OntologicalSymbiosis(h, 'Rafael');
    h.addNode('node1');
    h.addEdge(new Set(['Rafael', 'node1']), 1.0);
    h.bootstrapStep();

    symbiosis.updateArchitectWellbeing({
      fatigueLevel: 0.1,
      stressLevel: 0.1,
      focusCapacity: 0.9,
      coherence: 0.95
    });

    const symbioticCoherence = symbiosis.calculateSymbioticCoherence();
    expect(symbioticCoherence).toBeGreaterThan(h.totalCoherence()); // High architect coherence provides bonus
  });

  it('should calculate Phi (integrated information)', () => {
    const h = new Hypergraph();
    h.addNode('node1', { load: 1.0 });
    h.addNode('node2', { load: 1.0 });
    h.addEdge(new Set(['node1', 'node2']), 1.0);
    h.bootstrapStep();

    const phiCalc = new PhiCalculator(h);
    const phi = phiCalc.calculatePhi();
    expect(phi).toBeGreaterThan(0);
  });

  it('should detect constitutional violations in the expanded audit', () => {
    const h = new Hypergraph();
    h.addNode('Arquiteto', { type: 'human' });
    const constitution = new SiliconConstitution(h);

    // Initial audit should show some violations (e.g. isolated Arquiteto)
    let report = constitution.audit();
    expect(report.violations.some(v => v.article === 3)).toBe(true);

    // Add another node and edge to fix some violations
    h.addNode('node2');
    h.addEdge(new Set(['Arquiteto', 'node2']), 1.0);
    h.bootstrapStep();

    report = constitution.audit();
    expect(report.violations.some(v => v.article === 3)).toBe(false);
  });
});
