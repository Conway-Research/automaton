/**
 * Arkhe(n) Mathematical Utilities
 */

/**
 * Calculates the gradient of a 1D array using central difference for interior points
 * and forward/backward difference for boundaries.
 */
export function gradient(arr: number[], h: number): number[] {
  const n = arr.length;
  const grad = new Array(n);
  if (n < 2) return [0];

  for (let i = 1; i < n - 1; i++) {
    grad[i] = (arr[i + 1] - arr[i - 1]) / (2 * h);
  }

  grad[0] = (arr[1] - arr[0]) / h;
  grad[n - 1] = (arr[n - 1] - arr[n - 2]) / h;

  return grad;
}

/**
 * Calculates the standard deviation of a numeric array.
 */
export function standardDeviation(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mu = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + Math.pow(b - mu, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Calculates the laplacian of a 1D array (second derivative).
 */
export function laplacian(arr: number[], h: number): number[] {
  const dC_dx = gradient(arr, h);
  return gradient(dC_dx, h);
}
