# References


## Primary technique & vulnerability sources
- Ken Tindell, 'CAN Injection: keyless car theft' (kentindell.github.io/2023/04/03/can-injection/)
- Tesla Model 3/Y CVE-2025-6785 (physical CAN injection, fixed in firmware 2023.44)
- KeenLab 'Experimental Security Assessment of BMW Cars' (Black Hat USA 2019)
- iDoka/awesome-automotive-can-id (community per-make CAN ID databases)

## Standalone reference files (in this directory)
- **DATABASE.md** — per-make CAN bus / access / frames reference (this build)
- **wire_colors.md** — OE CAN wire colour chart (verify-do-not-assume)
- **hardware.md** — CAN sniff/inject hardware comparison
- **dmm_verify.md** — multimeter verification procedure (termination, bias, shorts)
- **threat_mitigations.md** — threat landscape + OEM + customer mitigations

## Threat landscape
Ken Tindell documented 100+ products on dark-web sites bypassing car security — fake key fobs and 'emergency start' devices (falsely marketed as for owners who lost keys / locksmiths). Prices up to €5000. Targets include Jeep, Maserati, Honda, Renault, Jaguar, Fiat, Peugeot, Nissan, Ford, BMW, VW, Chrysler, Cadillac, GMC, Toyota/Lexus.

> Full mitigation detail (SecOC, authenticated gateways, key-fob sleep, customer advice) is in **threat_mitigations.md**.

### Manufacturer mitigations (summary)
- SecOC (Secure Onboard Communication) — authenticated/encrypted CAN messages (newer VAG, BMW, F-150).
- Authenticated gateways — reject unauthorised frames.
- CAN-FD — higher speed + harder to inject naively.
- Key-fob motion sensors / sleep mode — defeats PKE relay.
- OBD-II port locks / CAN shields — block physical tap at the port.
- Firmware updates — e.g. Tesla 2023.44 fixed CVE-2025-6785.
- Customer advice: OBD port lock, faraday pouch for keys, keep firmware current, CAN-bus intrusion detection.

## Per-make community frame databases (start here to extract real IDs)
- https://github.com/iDoka/awesome-automotive-can-id  (curated index of per-make CAN ID repos)
- https://github.com/iDoka/awesome-canbus  (CAN reverse-engineering tools)
- https://opengarages.org  (Raw link references for CAN IDs)
- https://github.com/commaai/opendbc  (CommaAI decoder ring DB)

## OEM wire-colour + DMM + hardware sources (from Ratchet research)
- VAG SSP269 CAN Bus Data Transfer: vaglinks.com/Docs/SSP
- InCartec 'Typical OE CANbus wire colours' chart (incartec blob PDF)
- dauntlessdevices.com CAN direct-wire installation info
- Ford MS/HS-CAN pinout: zacharyschneider.ca; yuchormanski.wordpress.com (FORScan)
- DMM method: gridconnect.com; obd-cable.com; canbusacademy.com; pievcore.com
- Threat/dark-web: securityweek.com; can-cia.org CAN Injection PDF; nvd CVE-2023-29389
- Tesla 2023.44 / CVE-2025-6785: plaxidityx.com; hardwear.io SecOC key extraction
