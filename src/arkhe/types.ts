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
