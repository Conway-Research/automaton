import { ulid } from 'ulid';
import type { ArkheNode, ArkheHyperedge, ArkheNodeData, HypergraphState, IHandoverManager } from './types.js';
import { CoherenceParams, DEFAULT_COHERENCE_PARAMS } from './proto/v1beta1/params.js';

export class Hypergraph {
  public nodes: Map<string, ArkheNode> = new Map();
  public edges: ArkheHyperedge[] = [];
  public lastEvolutionTimestamp: number = Date.now();

  // Custom modules parameters (Bloco Ω+∞+144)
  public alpha: number = DEFAULT_COHERENCE_PARAMS.alpha; // Dissipation weight
  public beta: number = DEFAULT_COHERENCE_PARAMS.beta;  // Integrated Information weight
  public dissipation: number = 0.0;
  public phiValue: number = 0.0;

  constructor() {}

  public addNode(nodeId?: string, data: ArkheNodeData = {}): ArkheNode {
    const id = nodeId || ulid();
    const node: ArkheNode = {
      id,
      data,
      coherence: 1.0,
    };
    this.nodes.set(id, node);
    return node;
  }

  public addEdge(nodeIds: Set<string>, weight: number = 1.0): ArkheHyperedge {
    for (const nid of nodeIds) {
      if (!this.nodes.has(nid)) {
        throw new Error(`Node ${nid} does not exist`);
      }
    }
    const edge: ArkheHyperedge = {
      id: ulid(),
      nodes: nodeIds,
      weight,
    };
    this.edges.push(edge);
    return edge;
  }

  public bootstrapStep(handoverManager?: IHandoverManager, windowMs: number = 60000): void {
    this.lastEvolutionTimestamp = Date.now();
    /** Single bootstrap iteration: update node coherence based on incident edges. */
    for (const node of this.nodes.values()) {
      if (handoverManager) {
        // C_local = tanh(handover_rate * avg_intensity) from Ω+∞+144
        const rate = handoverManager.getHandoverRate(node.id, windowMs);
        const intensity = handoverManager.getAvgIntensity(node.id, windowMs);
        node.coherence = Math.tanh(rate * intensity);
      } else {
        const incidentWeights = this.edges
          .filter((e) => e.nodes.has(node.id))
          .map((e) => e.weight);

        if (incidentWeights.length > 0) {
          node.coherence = incidentWeights.reduce((a, b) => a + b, 0) / incidentWeights.length;
        } else {
          node.coherence = 0.0;
        }
      }
    }
  }

  /**
   * C_total = (1/N * sum(C_i)) - alpha * D + beta * Phi
   */
  public totalCoherence(phiValue: number = 0.0): number {
    if (this.nodes.size === 0) return 0.0;
    let sum = 0;
    for (const node of this.nodes.values()) {
      sum += node.coherence;
    }
    const avgCoherence = sum / this.nodes.size;

    const cTotal = avgCoherence - (this.alpha * this.dissipation) + (this.beta * (phiValue || this.phiValue));

    return Math.max(0, Math.min(1, cTotal));
  }

  /**
   * Returns the current integrated information value.
   */
  public calculatePhi(): number {
    return this.phiValue;
  }

  public toJSON(): HypergraphState {
    const nodes: Record<string, ArkheNodeData> = {};
    for (const [id, node] of this.nodes) {
      nodes[id] = node.data;
    }
    return {
      nodes,
      edges: this.edges.map((e) => ({
        nodes: Array.from(e.nodes),
        weight: e.weight,
      })),
    };
  }

  public static fromJSON(state: HypergraphState): Hypergraph {
    const h = new Hypergraph();
    for (const [id, data] of Object.entries(state.nodes)) {
      h.addNode(id, data);
    }
    for (const e of state.edges) {
      h.addEdge(new Set(e.nodes), e.weight);
    }
    return h;
  }

  public getConnectedComponents(): string[][] {
    const components: string[][] = [];
    const visited = new Set<string>();

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        const component: string[] = [];
        const queue = [nodeId];
        visited.add(nodeId);

        while (queue.length > 0) {
          const u = queue.shift()!;
          component.push(u);

          for (const edge of this.edges) {
            if (edge.nodes.has(u)) {
              for (const v of edge.nodes) {
                if (!visited.has(v)) {
                  visited.add(v);
                  queue.push(v);
                }
              }
            }
          }
        }
        components.push(component);
      }
    }

    return components;
  }
}
