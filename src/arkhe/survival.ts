import { getSurvivalTier } from '../conway/credits.js';
import type { SurvivalTier } from '../types.js';

/**
 * Survival Module - Manages the transition between different survival tiers based on credits.
 */
export class SurvivalManager {
  private currentTier: SurvivalTier = "normal";

  constructor() {}

  /**
   * Evaluates the current survival tier based on compute credits.
   */
  public processSurvival(creditsCents: number): SurvivalTier {
    this.currentTier = getSurvivalTier(creditsCents);
    return this.currentTier;
  }

  public getCurrentTier(): SurvivalTier {
    return this.currentTier;
  }
}
