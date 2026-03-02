import { HyperNode } from './hypernode.js';
import { EvolutionLedger } from './evolution-ledger.js';
import { HardwareBridge } from './hardware-bridge.js';
import { PhysicsIntent } from './physics-dsl.js';

/**
 * HyperFederation - Orchestrates a collection of HyperNodes.
 * Manages the global influence field and records the collective evolution ledger.
 */
export class HyperFederation {
  public nodes: HyperNode[];
  public ledger: EvolutionLedger;

  constructor(nNodes: number = 5) {
    this.nodes = Array.from({ length: nNodes }, (_, i) => new HyperNode(`node-${i}`));
    this.ledger = new EvolutionLedger();
  }

  /**
   * Runs a complete epoch of simulation across the entire federation.
   */
  public runEpoch(steps: number = 100): void {
    console.log(`🌌 [ARKHE] Initiating Hyperconnected Federation (${this.nodes.length} nodes)...`);

    for (let t = 0; t < steps; t++) {
      // 1. Environmental Input from HardwareBridge
      const envInput = HardwareBridge.readEntropy();

      // 2. Global Mean-Field Calculation (Small-World Topology Simulation)
      const globalState = new Array(this.nodes[0].C.length).fill(0);
      for (const node of this.nodes) {
        for (let i = 0; i < node.C.length; i++) {
          globalState[i] += node.C[i];
        }
      }
      for (let i = 0; i < globalState.length; i++) {
        globalState[i] /= this.nodes.length;
      }

      // 3. Parallel Evolution and Metamorphosis Decision
      for (const node of this.nodes) {
        const decision = node.runCycle(globalState, envInput);

        // 4. Metamorphosis and Ledger Recording
        if (decision && decision !== node.intent) {
          const hash = this.ledger.recordMetamorphosis(node.id, node.intent, decision, node.phi);
          console.log(`T+${t.toString().padStart(3, '0')} | Node ${node.id} Metamorphosis: ${node.intent} -> ${decision} (Φ=${node.phi.toFixed(2)}) [Hash: ${hash}]`);
          node.metamorphosis(decision as PhysicsIntent);
        }
      }

      // 5. Global Status Reporting
      if (t % 10 === 0) {
        const avgPhi = this.nodes.reduce((acc, n) => acc + n.phi, 0) / this.nodes.length;
        console.log(`      Global Status: Avg_Phi=${avgPhi.toFixed(3)} | Env_Input=${envInput.toFixed(2)}`);
      }
    }

    console.log("\n📜 [LEDGER] Final Evolution Trail (Last 5 blocks):");
    const recentBlocks = this.ledger.getRecentBlocks(5);
    for (const block of recentBlocks) {
      console.log(`  ${block.timestamp} | Node ${block.nodeId} | ${block.transition} | ${block.hash}`);
    }
  }
}
