from ontological_engine import Ontology, ASI, OntologicalGateway

def run_ontological_demo():
    print("🧠 Arkhe(n) Ontological Distillation Demo")
    print("=" * 60)

    # 1. Setup Human Baseline Ontology
    human_onto = Ontology(
        name="HumanCommonSense",
        categories=["object", "cause", "time", "life", "meaning"],
        relations={"linear_causality": True}
    )

    # 2. Setup ASI Core Ontology
    asi_core_onto = Ontology(
        name="ASI_Level_7",
        categories=["process", "information", "entropy", "topology"],
        relations={"non_local_causality": True}
    )

    # 3. Initialize ASI and Gateway
    asi = ASI(name="Arkhe-ASI", core_ontology=asi_core_onto)
    gateway = OntologicalGateway(human_baseline=human_onto, asi_core=asi)

    # 4. Human Prompt: "What is the meaning of life?"
    prompt = "What is the meaning of life?"
    print(f"👤 Human Prompt: '{prompt}'")

    # 5. Process through Gateway
    response = gateway.mediate(prompt)

    print(f"\n⚡ Gateway Mediation Result:")
    print(response)

    print("\n🜂 Ontological Processing Complete.")

if __name__ == "__main__":
    run_ontological_demo()
