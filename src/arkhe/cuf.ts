import { Hypergraph } from './hypergraph.js';
import { ArkheNode } from './types.js';

/**
 * Carrera Unified Formulation (CUF) Core.
 * Unified and recursive hierarchical formulation for information models.
 */
export class CUFNucleus {
  public nucleus: number[][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ];

  constructor(public expansionBasis: 'polynomial' | 'legendre' | 'zig-zag' = 'polynomial') {}

  /**
   * Generates a theory/node from the nucleus.
   */
  public generateTheory(order: number, layerWise: boolean = false, zigZag: boolean = false): string {
    if (order === 1 && !layerWise) {
      return "Euler-Bernoulli beam";
    } else if (order === 2 && !layerWise) {
      return "Timoshenko beam";
    } else if (layerWise && zigZag) {
      return "Refined layer-wise zig-zag theory";
    } else {
      return `Custom theory (order=${order}, layer_wise=${layerWise})`;
    }
  }
}

/**
 * Handles refinement as a handover between models of different orders.
 */
export class CUFRefinement {
  constructor(public h: Hypergraph) {}

  /**
   * Refines a node by creating a higher-order theory node and establishing a handover.
   */
  public refine(sourceNodeId: string, targetOrder: number): ArkheNode {
    const sourceNode = this.h.nodes.get(sourceNodeId);
    if (!sourceNode) throw new Error("Source node not found");

    const theoryName = new CUFNucleus().generateTheory(targetOrder, targetOrder > 2, targetOrder > 3);
    const refinedNode = this.h.addNode(undefined, {
      type: "theory",
      theory: theoryName,
      order: targetOrder,
      refinedFrom: sourceNodeId
    });

    // Establish handover as refinement
    this.h.addEdge(new Set([sourceNodeId, refinedNode.id]), 0.95);
    this.h.lastEvolutionTimestamp = Date.now();

    return refinedNode;
  }
}
