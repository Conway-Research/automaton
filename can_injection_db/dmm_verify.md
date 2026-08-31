# Multimeter (DMM) Verification of CAN-H / CAN-L

Goal: confirm which wire is CAN-H vs CAN-L, that the bus is correctly terminated,
and that there is NO short to ground or +12V. Use a DMM with Ω and DC-V modes.
Disconnect the battery / wait for modules to sleep where the test says "power off".

⚠️ WIRE COLOURS ARE NOT STANDARD — always confirm with a DMM before connecting
any interface or cutting a wire.

## Step 1 — Termination resistance (power OFF)
1. Key off, battery disconnected or all modules asleep (wait a few minutes).
2. DMM on Ω (resistance).
3. Probe CAN-H to CAN-L.
   - ≈ 60 Ω  → correct: two 120Ω terminators in parallel (one at each bus end). ✅
   - ≈ 120 Ω → one terminator missing/open (bus works but reflection-prone).
   - < 60 Ω  → extra terminator added or partial short.
   - ≈ 0 Ω / dead short → short between H and L.
   - OL / open → broken backbone or both terminators missing.

## Step 2 — Idle bias voltages (power ON, engine OFF)
1. DMM on DC V.
2. CAN-H → ground: ≈ 2.5–3.0 V (often ~2.6 V).
3. CAN-L → ground: ≈ 2.0–2.5 V (often ~2.4 V).
   - In a resting (recessive) bus the two are close (within ~0.1–0.2 V).
   - Telling H from L: CAN-H idles slightly higher than CAN-L. During traffic,
     CAN-H rises toward ~3.5 V and CAN-L drops toward ~1.5 V (differential ≈ 2 V).
     A DMM averages, so on a busy bus you'll see H ≈ 2.7–3.0 V and L ≈ 2.0–2.3 V.
     The HIGHER line is CAN-H.
   - Differential check: probe CAN-H (+) to CAN-L (−); idle ≈ 0.0–0.1 V.
     If you read battery voltage here, CAN-H is shorted to power somewhere.

## Step 3 — Short-to-power / short-to-ground checks
   - CAN-H stuck at ~0 V → short to ground on the H line.
   - CAN-L stuck at ~5 V / 12 V → short to a power/reference rail.
   - Either line at ~12 V → short to +12V (battery / ignition feed).
   - Both at 0 V → broken backbone; no ECU driving the line.
   - Fix: unplug modules one at a time (start at the far end) until voltage
     returns to ~2.5 V to isolate the faulty module/harness section.

## Step 4 — Transceiver-to-ground isolation (power OFF)
   - DMM on lowest Ω scale. Measure CAN-H → ground and CAN-L → ground.
     Should read megaohms / open. A low reading = faulty transceiver or harness fault.

## Pin reference for the OBD-II port
   - HS-CAN: pin 6 (CAN-H) and pin 14 (CAN-L).
   - Ford MS-CAN: pin 3 (H) / pin 11 (L).
   - Older VW comfort CAN: pin 1 / pin 9 (where present).

## Sources
gridconnect.com "How to diagnose a CAN network"; obd-cable.com "CAN Bus Diagnostics:
Multimeter vs Scope"; buscmms.com "Bus CAN Bus Diagnostics Guide"; canbusacademy.com
troubleshooting guide; pievcore.com "measure CAN bus health with a multimeter".
