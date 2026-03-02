/**
 * Arkhe(n) Coherence Module Parameters (Ω+∞+145).
 */
export interface CoherenceParams {
  /** Número de blocos na janela de cálculo */
  window: number;
  /** Peso da dissipação (α) */
  alpha: number;
  /** Peso da informação integrada (β) */
  beta: number;
  /** Taxa máxima de handovers por bloco por nó */
  maxHandoverRate: number;
  /** Limiar mínimo de coerência para participação em governança */
  minCoherence: number;
  /** Intervalo (em blocos) entre atualizações de C_total */
  updateInterval: number;
}

export const DEFAULT_COHERENCE_PARAMS: CoherenceParams = {
  window: 10000,
  alpha: 0.3,
  beta: 0.2,
  maxHandoverRate: 100,
  minCoherence: 0.5,
  updateInterval: 10,
};
