# ============================================================
# ARKHE PLASMA COSMOLOGY MODEL
# ============================================================
# Based on Alfvén's Cosmic Plasma and electromagnetic structure formation.

import numpy as np
from runtime import Node, Handover, ANLType, ANLValue, PreservationProtocol

class PlasmaCosmologyModel:
    def __init__(self):
        self.mu0 = 4 * np.pi * 1e-7 # Magnetic permeability of free space
        self.c = 299792458.0

    def create_plasma_region(self, node_id, density, temp_e, temp_i, B, E):
        """
        Creates a node representing a region of cosmic plasma.
        """
        return Node(
            id=node_id,
            state_space=ANLType.VECTOR,
            attributes={
                'density': ANLValue(ANLType.VECTOR, (3,), np.array(density)), # e, ion, neutral
                'temperature': ANLValue(ANLType.VECTOR, (2,), np.array([temp_e, temp_i])),
                'B': ANLValue(ANLType.VECTOR, (3,), np.array(B)),
                'E': ANLValue(ANLType.VECTOR, (3,), np.array(E)),
                'velocity': ANLValue(ANLType.VECTOR, (3,), np.zeros(3)),
                'current_density': ANLValue(ANLType.VECTOR, (3,), np.zeros(3))
            }
        )

    def create_plasma_filament(self, node_id, current, radius, length):
        """
        Birkeland Filament: Magnetically confined electric current.
        """
        return Node(
            id=node_id,
            state_space=ANLType.SCALAR,
            attributes={
                'current': ANLValue(ANLType.SCALAR, (), current),
                'radius': ANLValue(ANLType.SCALAR, (), radius),
                'length': ANLValue(ANLType.SCALAR, (), length),
                'twist': ANLValue(ANLType.SCALAR, (), 1.0)
            }
        )

    def create_double_layer_handover(self, region_a, region_b, voltage_drop):
        """
        Double Layer: Boundary that accelerates particles.
        """
        def effect(source_node):
            # Simulation of particle acceleration effect
            return f"Accelerating particles with {voltage_drop}V drop between {region_a.id} and {region_b.id}"

        return Handover(
            id=f"DL_{region_a.id}_{region_b.id}",
            source=region_a,
            target=region_b,
            protocol=PreservationProtocol.CREATIVE,
            map_state=effect
        )

    def create_pinch_interaction(self, filament_1, filament_2):
        """
        Z-Pinch Interaction: Parallel currents attract and twist.
        """
        def calculate_pinch(f1):
            # Simplified force calculation F = (mu0 * I1 * I2) / (2 * pi * d)
            # We assume a reference d for the demo
            d = 1000.0
            i1 = f1.attributes['current'].data
            i2 = filament_2.attributes['current'].data
            force = (self.mu0 * i1 * i2) / (2 * np.pi * d)
            return force

        return Handover(
            id=f"Pinch_{filament_1.id}_{filament_2.id}",
            source=filament_1,
            target=filament_2,
            protocol=PreservationProtocol.TRANSMUTATIVE,
            map_state=calculate_pinch
        )

    def create_annihilation_handover(self, ambi_region, p_matter, p_antimatter):
        """
        Matter-Antimatter annihilation at boundaries.
        """
        def annihilate(source):
            energy = (p_matter['mass'] + p_antimatter['mass']) * (self.c**2)
            return energy

        return Handover(
            id=f"Annihilation_{ambi_region.id}",
            source=ambi_region,
            target=ambi_region, # Self-interaction in the region
            protocol=PreservationProtocol.DESTRUCTIVE,
            map_state=annihilate
        )
