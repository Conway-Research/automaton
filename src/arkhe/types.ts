export interface ArkheNodeData {
  type?: string;
  symbol?: string;
  [key: string]: any;
}

export interface ArkheNode {
  id: string;
  data: ArkheNodeData;
  coherence: number;
  toBeRemoved?: boolean;
  handoverRate?: number;
  avgIntensity?: number;
}

export interface ArkheHyperedge {
  id: string;
  nodes: Set<string>;
  weight: number;
  intensity?: number;
  type?: string;
  metadata?: any;
}

export interface HypergraphState {
  nodes: Record<string, ArkheNodeData>;
  edges: Array<{ nodes: string[]; weight: number }>;
}

export interface IHandoverManager {
  getHandoverRate(nodeId: string, windowMs: number): number;
  getAvgIntensity(nodeId: string, windowMs: number): number;
}
