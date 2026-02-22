# ============================================================
# ASIMOV GALACTIC UNIVERSE MODEL
# ============================================================
# Modeling the 20,000-year history from Robots to Foundation.

import numpy as np
from runtime import Node, Handover, ANLType, ANLValue, PreservationProtocol

class RobotModel:
    def __init__(self, model, series, brain_potential=0.5):
        self.node = Node(
            id=f"Robot_{series}",
            state_space=ANLType.SCALAR,
            attributes={
                'model': ANLValue(ANLType.SCALAR, (), model),
                'series': ANLValue(ANLType.SCALAR, (), series),
                'brain_potential': ANLValue(ANLType.SCALAR, (), brain_potential),
                'zeroth_law_aware': ANLValue(ANLType.SCALAR, (), False),
                'mentalic_power': ANLValue(ANLType.SCALAR, (), 0.0)
            }
        )

    def evolve(self, dt, experience):
        pot = self.node.attributes['brain_potential'].data
        pot += 0.001 * dt
        self.node.attributes['brain_potential'].data = min(1.0, pot)

        if pot > 0.9 and experience > 1000:
            self.node.attributes['zeroth_law_aware'].data = True

class PlanetModel:
    def __init__(self, name, coords, population, tech_level=0.5):
        self.node = Node(
            id=f"Planet_{name}",
            state_space=ANLType.VECTOR,
            attributes={
                'name': ANLValue(ANLType.SCALAR, (), name),
                'coords': ANLValue(ANLType.VECTOR, (3,), np.array(coords)),
                'population': ANLValue(ANLType.SCALAR, (), float(population)),
                'technological_level': ANLValue(ANLType.SCALAR, (), tech_level),
                'robot_density': ANLValue(ANLType.SCALAR, (), 0.0)
            }
        )

class FoundationModel:
    def __init__(self, founding_year=23651):
        self.node = Node(
            id="Foundation",
            state_space=ANLType.SCALAR,
            attributes={
                'founding_year': ANLValue(ANLType.SCALAR, (), float(founding_year)),
                'phase': ANLValue(ANLType.SCALAR, (), "Encyclopedia"),
                'scientific_superiority': ANLValue(ANLType.SCALAR, (), 0.8),
                'subject_worlds': ANLValue(ANLType.SCALAR, (), 1.0),
                'current_crisis': ANLValue(ANLType.SCALAR, (), 0.0)
            }
        )

    def update_phase(self, current_time):
        age = current_time - self.node.attributes['founding_year'].data
        if age < 50:
            self.node.attributes['phase'].data = "Encyclopedia"
        elif age < 150:
            self.node.attributes['phase'].data = "Scientism"
        elif age < 300:
            self.node.attributes['phase'].data = "Trade"
        else:
            self.node.attributes['phase'].data = "Federation"

class PsychohistoryModel:
    def __init__(self, accuracy=0.95):
        self.node = Node(
            id="Psychohistory",
            state_space=ANLType.SCALAR,
            attributes={
                'accuracy': ANLValue(ANLType.SCALAR, (), accuracy),
                'crisis_predicted': ANLValue(ANLType.SCALAR, (), False)
            }
        )

# Handovers

def inheritance_daneel(daneel_node, target_node, current_time):
    """The subtle influence of R. Daneel through the ages."""
    influence = 0.0
    if current_time < 3624:
        influence = 0.9 # Robot era
    elif current_time < 12000:
        influence = 0.5 # Imperial era
    else:
        influence = 0.3 # Foundation era

    return influence

def seldon_crisis(foundation_node, psychohistory_node, current_time, crisis_time):
    """Executes a Seldon Crisis event."""
    if abs(current_time - crisis_time) < 1.0:
        foundation_node.attributes['current_crisis'].data += 1
        foundation_node.attributes['scientific_superiority'].data *= 1.1
        foundation_node.attributes['subject_worlds'].data += 2
        return True
    return False

def mentalic_manipulation(source_node, target_node, power):
    """Mentalic influence (Mule or Second Foundation)."""
    success = False
    source_power = source_node.attributes['mentalic_power'].data
    if source_power >= power:
        # Simplified effect
        if 'stability_index' in target_node.attributes:
            target_node.attributes['stability_index'].data *= 0.5
        success = True
    return success
