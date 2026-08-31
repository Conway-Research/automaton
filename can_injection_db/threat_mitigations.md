# Threat Landscape + Mitigations (CAN Injection / Keyless Defeat)

## A. Commercial theft-device market (defensive awareness)
- Ken Tindell (CTO, Canis Automotive Labs) researched dark-web marketplaces and found
  **100+ products** sold to bypass car security — fake-key programmers and "emergency
  start" units — priced **up to ~€5,000**. Disguised as lost-key/locksmith aids but enable
  CAN injection theft.
- Core weakness: **Classical CAN frames are unauthenticated.** Receiving ECUs trust any
  frame on the bus. An attacker who reaches the bus (OBD port or exposed harness like the
  headlight connector) can spoof "key validated" messages.
- **CVE-2023-29389** — Toyota RAV4 2021 automatically trusts other ECUs' CAN messages;
  physically-proximate attacker pulls the bumper, reaches the headlight connector, and
  injects forged "Key is validated" frames to drive the car. Exploited in the wild.

## B. Manufacturer / OEM mitigations
| Mitigation | What it does | Notes |
|---|---|---|
| **SecOC (Secure Onboard Communication, AUTOSAR)** | Adds a Message Authentication Code (MAC) to CAN frames so only ECUs holding the secret key can emit valid frames; blocks naive spoofing | Rolling out on newer platforms; researchers extracted per-vehicle keys via fault-injection on non-HSM ECUs (hardwear.io) — defense must include HSM-backed key storage |
| **Authenticated / zoning gateways** | Gateway ECU brokers between domains, authenticates and filters cross-domain traffic; "partitions CAN networks" (Tindell's recommended fix) | Increasingly standard on new cars |
| **CAN-FD / CAN XL** | Higher bandwidth + (where implemented) improved framing; often paired with SecOC | Not a security control by itself, but enables MAC overhead |
| **Key-fob sleep / motion sensors** | Fob accelerometer sleeps the transmitter after ~40s–3min of no motion, killing relay attacks | Effective vs relay; does NOT stop CAN-injection or OBD key-programming |
| **Firmware/software updates** | e.g. Tesla 2023.44 closed a CAN-injection path (shift to drive + start via OBD behind rear seat, CVE-2025-6785) | Advise customers: keep OTA/firmware current |

## C. What a locksmith should advise customers (layered defense)
1. **OBD port lock / shield** — physical barrier preventing unauthorised dongles reaching
   the diagnostic port (OBD2 Shield & Lock). Lawful only when installed for the owner.
2. **CAN intrusion detection / "CAN shield"** — aftermarket gateways that monitor bus
   anomalies or require authentication before allowing OBD access.
3. **Secondary/digital immobiliser** — hidden PIN/code immobiliser (IGLA/Ghost class,
   ~US$1,200–1,800 installed) blocks engine start even if the ECU "thinks" a valid key
   is present; protects against relay, CAN-injection, and key-cloning.
4. **Key-fob hygiene** — Faraday pouch/box (must actually block RF; test it), or fobs with
   sleep mode; disable passive/keyless-go in high-risk parking if the model allows.
5. **Mechanical deterrents** — steering-wheel lock / Disklok as a visible, noisy barrier.
6. **Firmware hygiene** — keep vehicle software/OTA up to date (Tesla 2023.44 lesson).
7. **Awareness** — most keyless thefts are relay attacks; CAN-injection and OBD
   key-programming are the next tier. A locked OBD port + updated firmware + immobiliser
   covers all three.

## Sources
securityweek.com (thieves use CAN injection, €5k devices); kentindell.github.io/2023/04/03/can-injection;
can-cia.org CAN Injection PDF; nvd.nist.gov CVE-2023-29389; plaxidityx.com (Tesla 2023.44 / CVE-2025-6785);
hardwear.io SecOC key extraction; moderncartheft.com; smartkeylessprotector.com; gpsleaders.com OBD2 Shield & Lock.
