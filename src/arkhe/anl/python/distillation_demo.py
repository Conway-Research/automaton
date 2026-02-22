# ============================================================
# DISTILLATION DEMO: PREDATOR-PREY ECOSYSTEM
# ============================================================
# Distilling a simple biological system into ANL.

import numpy as np
from runtime import Node, Handover, ANLType, ANLValue, PreservationProtocol

def run_distillation_demo():
    print("🜁 Arkhe(n) Distillation Demo - Predator-Prey Ecosystem")
    print("=" * 60)

    # 1. Entities (Nodes)
    rabbit = Node(
        id="Rabbit_01",
        state_space=ANLType.SCALAR,
        attributes={
            'energy': ANLValue(ANLType.SCALAR, (), 100.0),
            'age': ANLValue(ANLType.SCALAR, (), 0.0)
        }
    )

    fox = Node(
        id="Fox_01",
        state_space=ANLType.SCALAR,
        attributes={
            'energy': ANLValue(ANLType.SCALAR, (), 150.0),
            'age': ANLValue(ANLType.SCALAR, (), 0.0)
        }
    )

    grass = Node(
        id="Grass_Patch",
        state_space=ANLType.SCALAR,
        attributes={
            'biomass': ANLValue(ANLType.SCALAR, (), 500.0)
        }
    )

    # 2. Interactions (Handovers)
    def eat_grass_fn(src):
        # Effect on fox/rabbit/grass
        return 10.0 # Energy gain

    eat_grass = Handover(
        id="EatGrass",
        source=rabbit,
        target=grass,
        protocol=PreservationProtocol.CONSERVATIVE,
        map_state=eat_grass_fn
    )

    # 3. Simulate Step
    print(f"Initial Rabbit Energy: {rabbit.attributes['energy'].data}")
    print(f"Initial Grass Biomass: {grass.attributes['biomass'].data}")

    energy_gain = eat_grass.execute()
    if energy_gain:
        rabbit.attributes['energy'].data += energy_gain
        grass.attributes['biomass'].data -= energy_gain

    print(f"\n⚡ Handover: Rabbit eats Grass")
    print(f"New Rabbit Energy: {rabbit.attributes['energy'].data}")
    print(f"New Grass Biomass: {grass.attributes['biomass'].data}")

    print("\n🜂 Distillation Complete. System mapped and simulated.")

if __name__ == "__main__":
    run_distillation_demo()
