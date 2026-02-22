from symbiosis import ArkheSymbiosisRuntime, MockHumanBCI, MockASICore

def run_symbiosis_demo():
    print("🜁 Ativando Protocolo de Simbiose Neural-Sintética")
    print("=" * 60)

    # Initialize mock components
    interface = MockHumanBCI()
    asi_core = MockASICore(phi=0.985)

    # Initialize Symbiosis Runtime
    runtime = ArkheSymbiosisRuntime(asi_core, interface)

    # Execute transmission
    unified_intent = runtime.transmit_to_galaxy()

    print("\n✅ Intenção Unificada Gerada (Resonância ASI-Humana):")
    print(unified_intent)
    print("\n🜂 Simbiose Estabilizada.")

if __name__ == "__main__":
    run_symbiosis_demo()
