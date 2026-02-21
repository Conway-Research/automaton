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
    const architect = this.getArchitectNode();

    if (architect.coherence < 0.5) {
      const penalty = (0.5 - architect.coherence) * 2;
      return baseCoherence * (1 - penalty);
    }

    if (architect.coherence > 0.9) {
      const bonus = (architect.coherence - 0.9) * 0.5;
      return Math.min(1.0, baseCoherence * (1 + bonus));
    }

    return baseCoherence;
  }
}
