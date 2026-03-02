/**
 * PHI-Consensus Module - Implements the Golden Ratio rhythm for consensus.
 * Based on Bloco Ω+∞+144.
 */

import { PHI } from './constants.js';

export interface ConsensusParams {
  targetBlockTimeSeconds: number;
  votingQuorum: number;
}

export class PhiConsensus {
  /**
   * Target block time: t_bloco = 6 * φ seconds ≈ 9.7s
   */
  public static getTargetBlockTime(): number {
    return 6 * PHI;
  }

  /**
   * Quorum for approval: φ * N_total ≈ 61.8%
   */
  public static calculateQuorum(totalVotes: number): number {
    return Math.ceil((1 / PHI) * totalVotes); // 1/PHI ≈ 0.618
  }

  /**
   * Checks if a proposal has reached the golden quorum.
   */
  public static hasReachedQuorum(yesVotes: number, totalVotes: number): boolean {
    const quorum = this.calculateQuorum(totalVotes);
    return yesVotes >= quorum;
  }
}
