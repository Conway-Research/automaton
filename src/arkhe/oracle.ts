import { HandoverManager } from './handover.js';

export interface RealityData {
  source: string;
  key: string;
  value: any;
  timestamp: number;
}

/**
 * Oracle Module - Injects external reality handovers into the hypergraph.
 * Based on Bloco Ω+∞+144.
 */
export class ArkheOracle {
  constructor(private handoverManager: HandoverManager) {}

  /**
   * Injects reality data as a special handover.
   */
  public injectReality(source: string, key: string, value: any, intensity: number = 0.9): void {
    const data: RealityData = {
      source,
      key,
      value,
      timestamp: Date.now(),
    };

    // Use "Oracle" as the source node for reality handovers.
    this.handoverManager.processHandover(
      "Oracle",
      "Reality",
      intensity,
      "reality_handover",
      data
    );
  }
}
