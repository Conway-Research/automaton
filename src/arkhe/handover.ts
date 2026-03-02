import { Hypergraph } from './hypergraph.js';

export interface Handover {
  fromNode: string;
  toNode: string;
  weight: number;
  intensity: number;
  type: string;
  timestamp: number;
  data?: any;
}

/**
 * Handover Module - Manages structured transfers of information and coherence contribution.
 */
export class HandoverManager {
  public handovers: Handover[] = [];
  private readonly MAX_HANDOVERS = 1000;

  constructor(private h: Hypergraph) {}

  /**
   * Processes a handover between two nodes.
   */
  public processHandover(fromNode: string, toNode: string, weight: number, type: string, data?: any, intensity: number = 1.0): Handover {
    if (!this.h.nodes.has(fromNode)) {
      this.h.addNode(fromNode);
    }
    if (!this.h.nodes.has(toNode)) {
      this.h.addNode(toNode);
    }

    const handover: Handover = {
      fromNode,
      toNode,
      weight,
      intensity,
      type,
      timestamp: Date.now(),
      data,
    };

    this.handovers.push(handover);

    // Prevent memory leak by keeping only the most recent handovers
    if (this.handovers.length > this.MAX_HANDOVERS) {
      this.handovers.shift();
    }

    // Reflect the handover in the hypergraph as an edge
    const edge = this.h.addEdge(new Set([fromNode, toNode]), weight);
    edge.intensity = intensity;
    edge.type = type;
    edge.metadata = data;

    return handover;
  }

  public getHandoversForNode(nodeId: string): Handover[] {
    return this.handovers.filter(h => h.fromNode === nodeId || h.toNode === nodeId);
  }

  public countActiveHandovers(nodeId: string): number {
    return this.getHandoversForNode(nodeId).length;
  }

  public getHandoverRate(nodeId: string, windowMs: number = 60000): number {
    const now = Date.now();
    const recent = this.handovers.filter(
      (h) => (h.fromNode === nodeId || h.toNode === nodeId) && now - h.timestamp < windowMs
    );
    return recent.length / (windowMs / 1000); // handovers per second
  }

  public getAvgIntensity(nodeId: string, windowMs: number = 60000): number {
    const now = Date.now();
    const recent = this.handovers.filter(
      (h) => (h.fromNode === nodeId || h.toNode === nodeId) && now - h.timestamp < windowMs
    );
    if (recent.length === 0) return 0;
    const sum = recent.reduce((acc, h) => acc + h.intensity, 0);
    return sum / recent.length;
  }

  public getTotalHandovers(windowMs: number = 60000): number {
    const now = Date.now();
    return this.handovers.filter((h) => now - h.timestamp < windowMs).length;
  }

  public getNodeHandoversCount(nodeId: string, windowMs: number = 60000): number {
    const now = Date.now();
    return this.handovers.filter(
      (h) => (h.fromNode === nodeId || h.toNode === nodeId) && now - h.timestamp < windowMs
    ).length;
  }
}
