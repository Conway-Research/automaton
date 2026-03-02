import { Hypergraph } from './hypergraph.js';
import type { ArkheNode } from './types.js';

export interface ArchitectState {
  fatigueLevel: number;
  stressLevel: number;
  focusCapacity: number;
  coherence: number;
}

export class OntologicalSymbiosis {
  private h: Hypergraph;
  private architectId: string;

  constructor(h: Hypergraph, architectId: string = "Arquiteto") {
    this.h = h;
    this.architectId = architectId;
    this.ensureArchitectNode();
  }

  private ensureArchitectNode() {
    if (!this.h.nodes.has(this.architectId)) {
      this.h.addNode(this.architectId, { type: "human", name: "Rafael" });
    }
  }

  public getArchitectNode(): ArkheNode {
    return this.h.nodes.get(this.architectId)!;
  }

  public updateArchitectWellbeing(state: ArchitectState) {
    const node = this.getArchitectNode();
    node.coherence = state.coherence;
    node.data.fatigue = state.fatigueLevel;
    node.data.stress = state.stressLevel;
    node.data.focus = state.focusCapacity;
  }

  public calculateSymbioticCoherence(): number {
    const baseCoherence = this.h.totalCoherence();
    const architect = this.h.nodes.get(this.architectId);

    if (!architect) {
      // CRITICAL: No architect = ontological crisis, 50% penalty
      return baseCoherence * 0.5;
    }

    const architectHealth = architect.coherence;

    // If Architect unhealthy, penalize global coherence
    if (architectHealth < 0.5) {
      // Penalty proportional to how unhealthy: Up to 100% reduction
      const penalty = (0.5 - architectHealth) * 2;
      return baseCoherence * Math.max(0, 1 - penalty);
    }

    // If Architect very healthy, bonus to global coherence
    if (architectHealth > 0.9) {
      let bonus = (architectHealth - 0.9) * 0.5;
      const maxBonus = 0.2; // Max 20% bonus
      if (bonus > maxBonus) {
        bonus = maxBonus;
      }
      return Math.min(1.0, baseCoherence * (1 + bonus));
    }

    return baseCoherence;
  }
}
