import { describe, it, expect } from 'vitest';
import { Hypergraph } from '../arkhe/hypergraph.js';
import { bootstrap } from '../arkhe/bootstrap.js';
import { SiliconConstitution } from '../arkhe/constitution.js';
import { OntologicalSymbiosis } from '../arkhe/symbiosis.js';
import { simulateTrinitySync } from '../arkhe/simulations.js';

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

  it('should run Trinity Sync simulation', () => {
    const h = new Hypergraph();
    simulateTrinitySync(h);

    expect(h.nodes.size).toBe(4); // Rafael + ACPU + Decoder + Neural_BCI
    expect(h.edges.length).toBe(3);

    const rafael = h.nodes.get("Rafael");
    expect(rafael).toBeDefined();
    expect(rafael?.coherence).toBeGreaterThan(0.9);
  });
});
