from asimov_universe import (
    RobotModel, PlanetModel, FoundationModel, PsychohistoryModel,
    inheritance_daneel, seldon_crisis
)
import numpy as np

def run_asimov_demo():
    print("🌌 Arkhe(n) Asimov Galactic Universe Simulation")
    print("=" * 60)

    # 1. Initialize Nodes
    daneel = RobotModel("Humaniform", "R. Daneel Olivaw", brain_potential=0.99)
    earth = PlanetModel("Earth", [0, 0, 0], 8e9, tech_level=0.1)
    trantor = PlanetModel("Trantor", [0, 0, 100], 45e9, tech_level=1.0)
    terminus = PlanetModel("Terminus", [10000, 5000, -3000], 1e5, tech_level=0.5)

    foundation = FoundationModel()
    psychohistory = PsychohistoryModel()

    # 2. Timeline Simulation
    timeline = [
        (3424, "Robot Era - Daneel serves Gladia"),
        (3624, "Earth Diaspora Begins"),
        (12000, "Imperial Era - Trantor at its Peak"),
        (23651, "Foundation Established at Terminus"),
        (23701, "First Seldon Crisis (Salvor Hardin)"),
        (23801, "Second Seldon Crisis (Hober Mallow)"),
        (24150, "Foundation and Earth - The Rediscovery")
    ]

    print(f"{'Year':<10} | {'Event':<40} | {'Daneel Influence'}")
    print("-" * 75)

    for year, event in timeline:
        # Calculate Daneel's influence via inheritance handover
        influence = inheritance_daneel(daneel.node, None, year)

        # Update Foundation state if applicable
        if year >= 23651:
            foundation.update_phase(year)
            # Check for crises
            if "Crisis" in event:
                seldon_crisis(foundation.node, psychohistory.node, year, year)

        print(f"{year:<10} | {event:<40} | {influence:.2f}")

    # 3. Final State Report
    print("\n✅ Final Foundation State (Year 24150):")
    print(f"  Phase: {foundation.node.attributes['phase'].data}")
    print(f"  Scientific Superiority: {foundation.node.attributes['scientific_superiority'].data:.2f}")
    print(f"  Crises Resolved: {foundation.node.attributes['current_crisis'].data}")

    print("\n🜂 Asimov History Simulation Complete.")

if __name__ == "__main__":
    run_asimov_demo()
