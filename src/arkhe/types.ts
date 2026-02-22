export interface ArkheNodeData {
  type?: string;
  symbol?: string;
  [key: string]: any;
}

export interface ArkheNode {
  id: string;
  data: ArkheNodeData;
  coherence: number;
}

export interface ArkheHyperedge {
  id: string;
  nodes: Set<string>;
  weight: number;
}

export interface HypergraphState {
  nodes: Record<string, ArkheNodeData>;
  edges: Array<{ nodes: string[]; weight: number }>;
}

export interface CognitiveState {
  coherence: number; // C - Structure/Memory
  fluctuation: number; // F - Entropy/Exploration
  instability: number; // z-axis from Aizawa attractor
  phase: 'EXPLORATION' | 'CONSOLIDATION' | 'CRITICAL_BALANCE';
  epoch: number;
  loss?: number;
  cfRatio: number;
  healthScore: number;
}
