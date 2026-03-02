import { describe, it, expect } from 'vitest';
import { Hypergraph } from '../arkhe/hypergraph.js';
import { bootstrap } from '../arkhe/bootstrap.js';
import { SiliconConstitution } from '../arkhe/constitution.js';
import { OntologicalSymbiosis } from '../arkhe/symbiosis.js';
import { PhiCalculator } from '../arkhe/phi.js';
import { HandoverManager } from '../arkhe/handover.js';
import { PhiConsensus } from '../arkhe/consensus.js';
import { ArkheOracle } from '../arkhe/oracle.js';
import { SurvivalManager } from '../arkhe/survival.js';
import { ReplicationManager } from '../arkhe/replication.js';

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

  it('should calculate Phi using Shannon Entropy', () => {
    const h = new Hypergraph();
    h.addNode('node1');
    h.addNode('node2');
    const handover = new HandoverManager(h);
    handover.processHandover('node1', 'node2', 1.0, 'test', {}, 0.9);

    const phiCalc = new PhiCalculator(h, handover);
    const phi = phiCalc.calculatePhi();
    // For 2 nodes with equal handover distribution, p1=0.5, p2=0.5
    // Phi = -(0.5*log2(0.5) + 0.5*log2(0.5)) = -log2(0.5) = 1.0
    expect(phi).toBeCloseTo(1.0, 3);
  });

  it('should calculate global coherence with dissipation and phi', () => {
    const h = new Hypergraph();
    h.addNode('node1');
    h.nodes.get('node1')!.coherence = 0.8;

    h.dissipation = 0.5;
    h.alpha = 0.1;
    h.beta = 0.2;

    // C_total = 0.8 - (0.1 * 0.5) + (0.2 * 0.5) = 0.8 - 0.05 + 0.1 = 0.85
    const cTotal = h.totalCoherence(0.5);
    expect(cTotal).toBe(0.85);
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

  it('should process handovers and reflect them in the hypergraph', () => {
    const h = new Hypergraph();
    h.addNode('node1');
    h.addNode('node2');
    const handover = new HandoverManager(h);

    handover.processHandover('node1', 'node2', 0.8, 'test_handover');
    expect(handover.handovers.length).toBe(1);
    expect(h.edges.length).toBe(1);
    expect(h.edges[0].weight).toBe(0.8);
    expect(handover.countActiveHandovers('node1')).toBe(1);
  });

  it('should manage survival tiers', () => {
    const survival = new SurvivalManager();
    // Based on SURVIVAL_THRESHOLDS in types.ts:
    // normal: > 50
    // low_compute: 11 - 50
    // critical: 1 - 10
    // dead: <= 0
    expect(survival.processSurvival(100)).toBe('normal');
    expect(survival.processSurvival(30)).toBe('low_compute');
    expect(survival.processSurvival(5)).toBe('critical');
    expect(survival.processSurvival(0)).toBe('dead');
  });

  it('should handle replication conditions', () => {
    const h = new Hypergraph();
    const survival = new SurvivalManager();
    const replication = new ReplicationManager(h, survival);

    // Initial state: coherence 0, tier normal
    survival.processSurvival(1000);
    expect(replication.canReplicate()).toBe(false);

    // High coherence
    h.addNode('node1');
    h.addNode('node2');
    h.addEdge(new Set(['node1', 'node2']), 1.0);
    h.bootstrapStep();
    expect(h.totalCoherence()).toBe(1.0);
    expect(replication.canReplicate()).toBe(true);

    // Unhealthy survival tier
    survival.processSurvival(50);
    expect(replication.canReplicate()).toBe(false);
  });

  it('should implement phi-consensus parameters', () => {
    const blockTime = PhiConsensus.getTargetBlockTime();
    expect(blockTime).toBeCloseTo(9.708, 3);

    expect(PhiConsensus.calculateQuorum(100)).toBe(62);
    expect(PhiConsensus.hasReachedQuorum(62, 100)).toBe(true);
    expect(PhiConsensus.hasReachedQuorum(61, 100)).toBe(false);
  });

  it('should inject reality via Oracle', () => {
    const h = new Hypergraph();
    const handover = new HandoverManager(h);
    const oracle = new ArkheOracle(handover);

    oracle.injectReality("Market", "Price", 10.5);
    expect(handover.handovers.length).toBe(1);
    expect(handover.handovers[0].type).toBe("reality_handover");
    expect(handover.handovers[0].data.value).toBe(10.5);
  });

  it('should run bootstrap with handover manager (tanh logic)', () => {
    const h = new Hypergraph();
    h.addNode('node1');
    const handover = new HandoverManager(h);

    // Simulate 2 handovers per second with intensity 0.5
    // rate = 2.0
    // intensity = 0.5
    // product = 1.0
    // tanh(1.0) ≈ 0.76159
    for(let i=0; i<120; i++) {
        handover.processHandover('node1', 'node2', 0.5, 'test', {}, 0.5);
    }

    h.bootstrapStep(handover);
    expect(h.nodes.get('node1')?.coherence).toBeCloseTo(0.7616, 4);
  });
});
