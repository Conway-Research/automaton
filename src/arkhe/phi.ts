import { Hypergraph } from './hypergraph.js';
import { HandoverManager } from './handover.js';
import { ArkheNode } from './types.js';

export interface Element {
  id: string;
  coherence: number;
}

export interface Connection {
  from: string;
  to: string;
  weight: number;
}

export interface CauseEffectStructure {
  elements: Element[];
  connections: Connection[];
}

export interface Partition {
  set1: Element[];
  set2: Element[];
}

export interface MICS {
  elements: Element[];
  integrated: boolean;
  phiValue: number;
}

/**
 * Phi (Integrated Information) Calculation Module.
 * Based on a simplified IIT 4.0 formalism and Shannon Entropy (Ω+∞+144).
 */
export class PhiCalculator {
  constructor(private h: Hypergraph, private handoverManager?: HandoverManager) {}

  /**
   * Calculates integrated information (Φ) for the hypergraph.
   */
  public calculatePhi(windowMs: number = 60000): number {
    // If handoverManager is provided, use Shannon Entropy approximation from Ω+∞+144
    if (this.handoverManager) {
      return this.calculateShannonPhi(windowMs);
    }

    const ces = this.buildCauseEffectStructure();
    if (ces.elements.length < 2) {
      return 0.0;
    }

    const mics = this.findMICS(ces);
    return mics.phiValue;
  }

  /**
   * Φ ≈ -Σ p_i log(p_i) where p_i is the fraction of handovers for node i.
   * We normalize p_i such that Σ p_i = 1 to calculate Shannon Entropy.
   */
  private calculateShannonPhi(windowMs: number): number {
    let participationSum = 0;
    const nodeCounts = new Map<string, number>();

    for (const nodeId of this.h.nodes.keys()) {
      const count = this.handoverManager!.getNodeHandoversCount(nodeId, windowMs);
      if (count > 0) {
        nodeCounts.set(nodeId, count);
        participationSum += count;
      }
    }

    if (participationSum === 0) return 0;

    let phi = 0;
    for (const count of nodeCounts.values()) {
      const p = count / participationSum;
      phi += p * Math.log2(p);
    }
    return -phi;
  }

  private buildCauseEffectStructure(): CauseEffectStructure {
    const elements: Element[] = Array.from(this.h.nodes.values()).map(n => ({
      id: n.id,
      coherence: n.coherence,
    }));

    const connections: Connection[] = this.h.edges.map(e => {
      const nodes = Array.from(e.nodes);
      return {
        from: nodes[0],
        to: nodes[1] || nodes[0], // Handle hyperedges by simplified mapping
        weight: e.weight,
      };
    });

    return { elements, connections };
  }

  private findMICS(ces: CauseEffectStructure): MICS {
    let minPartitionPhi = Infinity;

    const partitions = this.generatePartitions(ces);
    for (const partition of partitions) {
      const partitionPhi = this.calculatePartitionPhi(partition);
      if (partitionPhi < minPartitionPhi) {
        minPartitionPhi = partitionPhi;
      }
    }

    if (minPartitionPhi === Infinity) minPartitionPhi = 0;

    const wholePhi = this.calculateWholePhi(ces);
    const phiValue = Math.max(0, wholePhi - minPartitionPhi);

    return {
      elements: ces.elements,
      integrated: phiValue > 0,
      phiValue,
    };
  }

  private calculateWholePhi(ces: CauseEffectStructure): number {
    let total = 0;

    for (const conn of ces.connections) {
      const from = ces.elements.find(e => e.id === conn.from);
      const to = ces.elements.find(e => e.id === conn.to);

      if (from && to) {
        // Information flow = connection weight * geometric mean of coherences
        const coherenceMean = Math.sqrt(from.coherence * to.coherence);
        total += conn.weight * coherenceMean;
      }
    }

    return ces.elements.length > 0 ? total / ces.elements.length : 0;
  }

  private generatePartitions(ces: CauseEffectStructure): Partition[] {
    const partitions: Partition[] = [];
    const n = ces.elements.length;
    if (n < 2) return partitions;

    // Simplified: generate linear bipartitions
    for (let i = 1; i < n; i++) {
      partitions.push({
        set1: ces.elements.slice(0, i),
        set2: ces.elements.slice(i),
      });
    }

    return partitions;
  }

  private calculatePartitionPhi(partition: Partition): number {
    const ces = this.buildCauseEffectStructure();
    const phi1 = this.calculateSetPhi(partition.set1, ces.connections);
    const phi2 = this.calculateSetPhi(partition.set2, ces.connections);
    return phi1 + phi2;
  }

  private calculateSetPhi(elements: Element[], allConnections: Connection[]): number {
    if (elements.length === 0) return 0;

    const elementIds = new Set(elements.map(e => e.id));
    const internalConnections = allConnections.filter(c => elementIds.has(c.from) && elementIds.has(c.to));

    let total = 0;
    for (const conn of internalConnections) {
      const from = elements.find(e => e.id === conn.from);
      const to = elements.find(e => e.id === conn.to);

      if (from && to) {
        const coherenceMean = Math.sqrt(from.coherence * to.coherence);
        total += conn.weight * coherenceMean;
      }
    }

    return elements.length > 0 ? total / elements.length : 0;
  }
}
