from plasma_cosmology import PlasmaCosmologyModel

def run_plasma_demo():
    print("🜁 Arkhe(n) Plasma Cosmology - Structure Formation Demo")
    print("=" * 60)

    model = PlasmaCosmologyModel()

    # 1. Create Birkeland Filaments
    # High current filaments (10^18 Amperes as per Peratt's galaxy formation simulations)
    filament_1 = model.create_plasma_filament("Birkeland_A", current=1e18, radius=1e15, length=1e20)
    filament_2 = model.create_plasma_filament("Birkeland_B", current=1.2e18, radius=1e15, length=1e20)

    print(f"Node: {filament_1.id} | Current: {filament_1.attributes['current'].data:.1e} A")
    print(f"Node: {filament_2.id} | Current: {filament_2.attributes['current'].data:.1e} A")

    # 2. Simulate Pinch Interaction
    pinch = model.create_pinch_interaction(filament_1, filament_2)
    force = pinch.execute()

    print(f"\n⚡ Handover: Pinch Interaction Executed.")
    print(f"Calculated Pinch Force: {force:.2e} N/m")
    print("Observation: Parallel currents attract, leading to the formation of spiral structures (protogalaxies).")

    # 3. Create Double Layer
    region_a = model.create_plasma_region("Heliosphere", [1e6, 1e6, 0], 1e5, 1e4, [1e-9, 0, 0], [0, 0, 0])
    region_b = model.create_plasma_region("Interstellar_Medium", [1e3, 1e3, 0], 1e4, 1e3, [1e-10, 0, 0], [0, 0, 0])

    dl = model.create_double_layer_handover(region_a, region_b, voltage_drop=1e9)
    acceleration_msg = dl.execute()
    print(f"\n📡 Boundary Event: {acceleration_msg}")

    print("\n🜂 Plasma Simulation Complete.")

if __name__ == "__main__":
    run_plasma_demo()
