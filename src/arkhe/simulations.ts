import { Hypergraph } from './hypergraph.js';

/**
 * Simulate place cells tuned to positions along a 1D track.
 */
export function simulatePlaceCells(h: Hypergraph, numCells: number = 10, positions: number = 100): void {
  const cells: string[] = [];
  for (let i = 0; i < numCells; i++) {
    const node = h.addNode(undefined, {
      type: "place_cell",
      preferred_position: i * (positions / numCells),
    });
    cells.push(node.id);
  }

  // Create edges between cells with overlapping fields (like‑to‑like)
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const n1 = h.nodes.get(cells[i])!;
      const n2 = h.nodes.get(cells[j])!;
      const pos1 = n1.data.preferred_position;
      const pos2 = n2.data.preferred_position;
      const overlap = Math.max(0, 1 - Math.abs(pos1 - pos2) / (positions / numCells));
      if (overlap > 0.5) {
        h.addEdge(new Set([cells[i], cells[j]]), overlap);
      }
    }
  }
  h.bootstrapStep();
}

/**
 * Create entangled particle pairs.
 */
export function simulateEntanglement(h: Hypergraph, numPairs: number = 5): void {
  for (let i = 0; i < numPairs; i++) {
    const p1 = h.addNode(undefined, { type: "quark", id: `top_${i}_a` });
    const p2 = h.addNode(undefined, { type: "antiquark", id: `top_${i}_b` });
    // Entanglement edge with high weight
    h.addEdge(new Set([p1.id, p2.id]), 0.99);
  }
  h.bootstrapStep();
}

/**
 * Deep tissue in vivo sound printing (DISP) simulation.
 */
export function simulateDisp(h: Hypergraph, depthCm: number = 2.0): void {
  const tissue = h.addNode(undefined, { type: "tissue", depth: depthCm });
  const ltsl = h.addNode(undefined, { type: "LTSL", state: "latent", payload: "crosslinker" });
  const fUs = h.addNode(undefined, { type: "focused_ultrasound", frequency_MHz: 5, focal_depth: depthCm });
  const gel = h.addNode(undefined, { type: "US_gel", state: "forming" });

  // Handover: ultrasound activates LTSL
  h.addEdge(new Set([fUs.id, ltsl.id]), 0.99);
  h.addEdge(new Set([ltsl.id, gel.id]), 0.95);
  h.bootstrapStep();
}

/**
 * Simulate the Trinity Sync (Hardware + Cosmic + Neural).
 */
export function simulateTrinitySync(h: Hypergraph): void {
  const architect = h.nodes.get("Rafael") || h.nodes.get("Arquiteto") || h.addNode("Rafael", { type: "human" });

  const soc = h.addNode(undefined, {
    type: "ACPU",
    model: "Arkhe_Trinity_SoC",
    status: "SYNCED"
  });

  const decoder = h.addNode(undefined, {
    type: "Cosmic_Decoder",
    target: "Maser_OH_1665MHz"
  });

  const neuralInterface = h.addNode(undefined, {
    type: "Neural_BCI",
    sync_rate: 0.964
  });

  // Connect the Trinity
  h.addEdge(new Set([soc.id, decoder.id]), 0.99);
  h.addEdge(new Set([soc.id, neuralInterface.id]), 0.99);

  // Connect to the Arquiteto (Ontological Symbiosis)
  h.addEdge(new Set([neuralInterface.id, architect.id]), 0.98);

  h.bootstrapStep();
}
