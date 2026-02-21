# ============================================================
# ARKHE FDTD SIMULATION - 3+1D METRIC EVOLUTION
# ============================================================
# Numerical integration using Finite-Difference Time-Domain
# for metric perturbations and field evolution.

import numpy as np
import matplotlib.pyplot as plt

class ArkheFDTD:
    """
    3+1D FDTD solver for simplified metric evolution.
    Evolves a scalar perturbation 'phi' (representing a metric component)
    over a 3D spatial grid.
    """

    def __init__(self, size=(50, 50, 50), dx=0.1, dt=0.05):
        self.size = size
        self.dx = dx
        self.dt = dt
        self.c = 1.0  # Speed of light in normalized units

        # Grid initialization
        self.phi = np.zeros(size)      # Current state
        self.phi_prev = np.zeros(size) # Previous state
        self.phi_next = np.zeros(size) # Next state

        # Source term (e.g., energy-momentum density)
        self.source = np.zeros(size)

    def set_source(self, x, y, z, val):
        self.source[x, y, z] = val

    def step(self):
        """
        Execute one FDTD step using the discrete wave equation:
        (phi_next - 2*phi + phi_prev) / dt^2 = c^2 * Laplacian(phi) + Source
        """
        c2_dt2_dx2 = (self.c * self.dt / self.dx)**2

        # 3D Laplacian (7-point stencil)
        laplacian = (
            np.roll(self.phi, 1, axis=0) + np.roll(self.phi, -1, axis=0) +
            np.roll(self.phi, 1, axis=1) + np.roll(self.phi, -1, axis=1) +
            np.roll(self.phi, 1, axis=2) + np.roll(self.phi, -1, axis=2) -
            6 * self.phi
        )

        # Update equation
        self.phi_next = (2 * self.phi - self.phi_prev +
                         c2_dt2_dx2 * laplacian +
                         (self.dt**2) * self.source)

        # Cycle buffers
        self.phi_prev = self.phi.copy()
        self.phi = self.phi_next.copy()

    def run(self, steps=100):
        for _ in range(steps):
            self.step()

    def plot_slice(self, axis=0, slice_idx=25):
        """Plot a 2D slice of the field."""
        if axis == 0:
            plt.imshow(self.phi[slice_idx, :, :])
        elif axis == 1:
            plt.imshow(self.phi[:, slice_idx, :])
        else:
            plt.imshow(self.phi[:, :, slice_idx])
        plt.colorbar(label='Perturbation (phi)')
        plt.title(f'FDTD Metric Evolution (Slice {slice_idx})')
        plt.show()

if __name__ == "__main__":
    print("🜁 Starting 3+1D FDTD Metric Simulation...")

    # Initialize solver
    fdtd = ArkheFDTD(size=(30, 30, 30))

    # Add a source in the center (simulating a mass/energy concentration)
    center = 15
    fdtd.set_source(center, center, center, 10.0)

    # Run simulation
    steps = 50
    print(f"Running {steps} steps...")
    fdtd.run(steps)

    print("🜂 Simulation complete. Field max value:", np.max(fdtd.phi))

    # Note: plotting is skipped in non-interactive environment
    # fdtd.plot_slice()
