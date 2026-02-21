import { Hypergraph } from './hypergraph.js';

/** Run the bootstrap evolution for a given number of steps. */
export function bootstrap(h: Hypergraph, steps: number = 1): void {
  for (let i = 0; i < steps; i++) {
    h.bootstrapStep();
  }
}
