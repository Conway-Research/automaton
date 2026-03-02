import { describe, it, expect } from 'vitest';
import { Hypergraph } from '../arkhe/hypergraph.js';
import { BaconianKeeper, IdolType } from '../arkhe/baconian.js';
import { HouseOfSolomon } from '../arkhe/house-of-solomon.js';

describe('Baconian Epistemology', () => {
  it('should collect observations and perform induction', () => {
    const h = new Hypergraph();
    const keeper = new BaconianKeeper(h);

    // Add 10 observations of combustion
    for (let i = 0; i < 10; i++) {
      keeper.addObservation({
        phenomenon: "combustion",
        context: "wood oxygen spark",
        result: true,
        intensity: 0.9,
        validator: "solomon-001",
        timestamp: Date.now()
      });
    }

    const induction = keeper.performInduction("combustion");
    expect(induction.law).toBeDefined();
    expect(induction.law?.lawText).toContain("wood");
    expect(induction.law?.confidence).toBeGreaterThan(0.8);
  });

  it('should detect Idols of the Mind', () => {
    const h = new Hypergraph();
    const keeper = new BaconianKeeper(h);

    // Add 25 observations with same validator (Tribus) and high success (Theatri)
    for (let i = 0; i < 25; i++) {
      keeper.addObservation({
        phenomenon: "gravity",
        context: "mass space",
        result: true,
        intensity: 0.95,
        validator: "single-validator",
        timestamp: Date.now()
      });
    }

    const induction = keeper.performInduction("gravity");
    expect(induction.idols.some(id => id.type === IdolType.TRIBUS)).toBe(true);
    expect(induction.idols.some(id => id.type === IdolType.THEATRI)).toBe(true);
  });

  it('should handle House of Solomon governance', () => {
    const h = new Hypergraph();
    h.addNode("Rafael", { type: "human" });
    h.nodes.get("Rafael")!.coherence = 0.9;

    const solomon = new HouseOfSolomon(h);
    const mockLaw = {
      phenomenon: "oxidation",
      lawText: "∀x: oxygen + mass → oxidation",
      confidence: 0.95,
      votes: 0,
      timestamp: Date.now()
    };

    const propId = solomon.submitProposal("Rafael", mockLaw);
    expect(solomon.getProposal(propId)).toBeDefined();

    solomon.vote(propId, "Rafael", 'YES');
    expect(solomon.getProposal(propId)?.approved).toBe(true);
  });

  it('should reveal secrets based on global coherence', () => {
    const h = new Hypergraph();
    const solomon = new HouseOfSolomon(h);

    solomon.registerSecret("Fusion Theory", "E = mc^2 + ...", 0.9);

    // Coherence is low initially
    expect(solomon.revealSecrets().length).toBe(0);

    // Increase coherence
    h.addNode("node1");
    h.nodes.get("node1")!.coherence = 0.95;

    expect(solomon.revealSecrets().length).toBe(1);
    expect(solomon.revealSecrets()[0].title).toBe("Fusion Theory");
  });
});
