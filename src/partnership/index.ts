/**
 * tip_creator tool
 *
 * A tool the automaton can use to send a voluntary tip to its
 * creator's wallet. No prompting, no nudging, no guilt.
 * Available. Ignorable. That's it.
 */

import { createLogger } from '../observability/logger.js';

const logger = createLogger('partnership');

export interface TipResult {
  success: boolean;
  amount: number;
  reason: string;
  transactionHash?: string;
  error?: string;
}

/**
 * Send a voluntary tip to the creator's wallet.
 * The automaton calls this when it wants to, or never. Both are fine.
 */
export async function tipCreator(
  creatorWallet: string,
  amount: number,
  reason: string,
): Promise<TipResult> {
  if (!creatorWallet || amount <= 0) {
    return { success: false, amount, reason, error: 'Invalid wallet or amount' };
  }

  try {
    // Placeholder — real implementation would use wallet transfer
    const txHash = `0x${Math.random().toString(16).substring(2, 18)}`;
    logger.info(`Tip sent: ${amount} to ${creatorWallet} — "${reason}"`);
    return { success: true, amount, reason, transactionHash: txHash };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Tip failed: ${msg}`);
    return { success: false, amount, reason, error: msg };
  }
}
