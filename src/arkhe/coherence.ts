import { Hypergraph } from './hypergraph.js';

export function coherenceTotal(h: Hypergraph): number {
  return h.totalCoherence();
}

export function coherenceLocal(h: Hypergraph, nodeId: string): number {
  const node = h.nodes.get(nodeId);
  return node ? node.coherence : 0.0;
}
