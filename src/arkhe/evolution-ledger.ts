import { createHash } from 'crypto';

export interface EvolutionBlock {
  timestamp: string;
  nodeId: string;
  transition: string;
  phi: number;
  hash: string;
}

/**
 * EvolutionLedger - Records the developmental history of nodes in the hypergraph.
 * Provides a cryptographically-hashed audit trail of state transitions (metamorphosis).
 */
export class EvolutionLedger {
  public chain: EvolutionBlock[] = [];

  /**
   * Records a transition between physics intents.
   */
  public recordMetamorphosis(
    nodeId: string,
    oldIntent: string,
    newIntent: string,
    phiScore: number
  ): string {
    const timestamp = new Date().toISOString();
    const transition = `${oldIntent} -> ${newIntent}`;

    // Create a unique hash for this transition block
    const hashInput = `${nodeId}${timestamp}${transition}${phiScore}${this.chain.length}`;
    const hash = createHash('sha256').update(hashInput).digest('hex').substring(0, 16);

    const block: EvolutionBlock = {
      timestamp,
      nodeId,
      transition,
      phi: phiScore,
      hash
    };

    this.chain.push(block);
    return hash;
  }

  public getRecentBlocks(limit: number = 5): EvolutionBlock[] {
    return this.chain.slice(-limit);
  }
}
