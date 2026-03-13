/**
 * SpectralPhiAnalyzer - Computes Φ based on the Von Neumann Entropy of the covariance matrix.
 * Used to measure the complexity and integration of the state history.
 */
export class SpectralPhiAnalyzer {
  /**
   * Computes Spectral Phi (Φ) for a given history of state vectors.
   * @param history Matrix of [steps][neurons]
   */
  public static compute(history: number[][]): number {
    if (history.length < 10) return 0.5;

    // Calculate Covariance Matrix (Sample-based, e.g., 20x20 if history is 20 steps)
    const cov = this.calculateCovariance(history);

    // Extract Eigenvalues using Jacobi algorithm
    const eigenvalues = this.getEigenvalues(cov);

    // Normalize positive eigenvalues to get a probability distribution
    const positiveEigenvalues = eigenvalues.filter(val => val > 0);
    const sum = positiveEigenvalues.reduce((a, b) => a + b, 0);
    if (sum === 0) return 0;

    const probs = positiveEigenvalues.map(val => val / sum);

    // Von Neumann Entropy (Spectral Entropy)
    let entropy = 0;
    for (const p of probs) {
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    return entropy; // Measures state richness/complexity
  }

  /**
   * Calculates the covariance matrix of the history.
   * Treats rows as variables (as per np.cov default).
   */
  private static calculateCovariance(history: number[][]): number[][] {
    const n = history.length; // samples
    const m = history[0].length; // variables (neurons)

    const means = history.map(row => row.reduce((a, b) => a + b, 0) / m);
    const cov = Array.from({ length: n }, () => new Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < m; k++) {
          sum += (history[i][k] - means[i]) * (history[j][k] - means[j]);
        }
        const val = sum / (m - 1);
        cov[i][j] = val;
        cov[j][i] = val;
      }
    }
    return cov;
  }

  /**
   * Jacobi Eigenvalue Algorithm for symmetric matrices.
   */
  private static getEigenvalues(matrix: number[][]): number[] {
    const n = matrix.length;
    let A = matrix.map(row => [...row]);

    const maxIterations = 200;
    const eps = 1e-10;

    for (let iter = 0; iter < maxIterations; iter++) {
      // Find the largest off-diagonal element
      let maxVal = 0;
      let p = 0, q = 0;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (Math.abs(A[i][j]) > maxVal) {
            maxVal = Math.abs(A[i][j]);
            p = i; q = j;
          }
        }
      }

      if (maxVal < eps) break;

      // Calculate rotation parameters
      const diff = A[q][q] - A[p][p];
      let t;
      if (Math.abs(A[p][q]) < Math.abs(diff) * 1e-15) {
        t = A[p][q] / diff;
      } else {
        const phi = diff / (2 * A[p][q]);
        t = 1 / (Math.abs(phi) + Math.sqrt(1 + phi * phi));
        if (phi < 0) t = -t;
      }

      const c = 1 / Math.sqrt(1 + t * t);
      const s = t * c;
      const tau = s / (1 + c);

      // Perform rotation
      const temp_App = A[p][p];
      A[p][p] = temp_App - t * A[p][q];
      A[q][q] = A[q][q] + t * A[p][q];
      A[p][q] = 0;
      A[q][p] = 0;

      for (let i = 0; i < n; i++) {
        if (i !== p && i !== q) {
          const temp_ip = A[i][p];
          A[i][p] = temp_ip - s * (A[i][q] + tau * temp_ip);
          A[p][i] = A[i][p];
          const temp_iq = A[i][q];
          A[i][q] = temp_iq + s * (temp_ip - tau * temp_iq);
          A[q][i] = A[i][q];
        }
      }
    }

    return A.map((row, i) => row[i]);
  }
}
