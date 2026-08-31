# CAN Injection / Keyless-Defeat Research Database

> CAN injection is a documented vehicle-theft technique. This database is compiled for LICENSED automotive locksmiths / technicians performing authorized work (emergency access, immobilizer study, customer anti-theft advice). Reverse-engineering or defeating a vehicle's security on a vehicle you are not authorized to work on is illegal. Frame data marked UNKNOWN is genuinely unknown to public research — do not fabricate it.

## Core Technique

CAN injection = tap the CAN bus that the smart-key receiver ECU sits on, then inject forged frames impersonating the keyless receiver ('key validated / immobilizer release / unlock / start'). A gateway ECU copies the message to the powertrain bus; the immobilizer releases. Body-CAN messages are plaintext in most pre-2023/2024 cars. There is NO universal static 'frame X opens door on make Y' table: frames are proprietary per OEM and change by model year. The real research value is WHICH bus, WHERE it's reachable, and the METHOD to extract specific frames (signal capture / reverse engineering).

**OBD-II pin 6 = CAN-High, pin 14 = CAN-Low, pin 4/5 = ground, pin 16 = +12V.**

Canonical per-make frame database: https://github.com/iDoka/awesome-automotive-can-id


## Per-Make Reference

### Toyota / Lexus  (JP)

- **Key-auth bus:** Body/Control CAN (smart-key receiver ECU bus)
- **Bitrate:** 500k (model dependent)
- **OBD pins:** 6 (CAN-H) / 14 (CAN-L)
- **Body CAN at OBD?:** No — body/smart-key 'control CAN' is NOT on OBD pins 6/14; reached via headlight harness.
- **Access points:**
  - HEADLIGHT CONNECTOR (documented): thieves reached the 'control CAN' via the front headlight harness on RAV4 — confirmed by Ken Tindell's forensic analysis of a real theft.
  - OBD-II port (under dash, left of steering column, often exposed) — pins 6/14.
  - Gateway / DLC behind lower dash.
- **Published frames:** UNKNOWN (proprietary). Tindell disclosed the TECHNIQUE only — the device listens for a specific wake CAN frame, then bursts ~20 spoof 'key valid' frames/sec impersonating the smart-key ECU, plus a separate 'unlock' frame on pressing the speaker's Play button. The exact CAN IDs/payloads were NOT published (deliberately, to protect owners).
- **Researcher-disclosed IDs:** None published. CVE-2023-29389 (CAN Injection, multi-OEM incl. Toyota/Lexus) is the tracking CVE.
- **Devices marketed (dark web):** Dark-web 'emergency start' devices targeting Toyota/Lexus (RAV4, Land Cruiser, Prius, Highlander, GR Supra, plus Lexus ES/LC/LS/NX/RX) — per Tindell. Sold disguised as a JBL Bluetooth speaker.
- **Mitigations:** Newer Toyota firmware; key-fob sleep; OBD-port lock; gateway segmentation + SecOC/CryptoCAN.
- **References:** kentindell.github.io/2023/04/03/can-injection/; can-cia.org CAN Newsletter June 2023: The CAN Injection attack (Ken Tindell, Canis Labs); CVE-2023-29389; awesome-automotive-can-id -> Toyota, Lexus sections

### Tesla  (US)

- **Key-auth bus:** Body CAN reachable via externally available CAN wires
- **Bitrate:** 500k (CAN-FD on newer)
- **OBD pins:** N/A (non-standard Tesla diagnostic connector, center armrest)
- **Access points:**
  - OBD-style connector BEHIND REAR SEAT (Model 3) — PlaxidityX connected a home-made device here and shifted to drive + started engine (CVE-2025-6785).
  - Externally available CAN wires at the vehicle edge.
- **Published frames:** CVE-2025-6785: injection of specially-formed CAN messages to control remote-start / shift to drive / start engine. Affected Model 3 software < 2023.44; also Model Y. FIXED in firmware 2023.44. Exact message construction NOT disclosed publicly.
- **Devices marketed (dark web):** UNKNOWN (researcher-built device used in disclosure).
- **Mitigations:** Firmware 2023.44+ eliminates this specific path; keep Tesla updated.
- **References:** CVE-2025-6785 / GHSA-wqqj-jmr5-3p39; plaxidityx.com/blog/blog-post/tesla-keyless-car-theft-can-injection-vulnerability/

### Volkswagen / Audi (VAG)  (EU)

- **Key-auth bus:** Comfort/Body CAN (100k or 500k) + Powertrain CAN (500k), routed by Gateway Module 19 (J533). IMMO lives in cluster/BCM/Kessy; IMMO4 (pre-2010, AES-128 rolling), IMMO5 (post-2010, encrypted) on MQB.
- **Bitrate:** Powertrain 500k; Comfort 100k/500k; newer = CAN-FD + SecOC
- **OBD pins:** 6 (CAN-H) / 14 (CAN-L); 1/9 (older comfort CAN)
- **Body CAN at OBD?:** Partial — powertrain CAN at OBD via gateway; comfort/body CAN reachable at node (BCM/gateway), older models on pins 1/9.
- **Access points:**
  - OBD-II (driver lower dash, usually behind cover) — pins 6/14 reach powertrain CAN via gateway.
  - VW-specific: pin 1/9 carry older Comfort CAN on some models.
  - Radio Quadlock connector (infotainment bus tap) per mqbcan project.
  - BCM / gateway module location varies by model.
- **Published frames:** Community DBs exist (awesome-automotive-can-id VW/Audi, mqbcan, VW_Flash). IMMO5 emulator research shows 3 CAN messages (ID 7FF) for ECU authorization — but this is offline-emulator territory, NOT a live 'unlock door' frame. Live immo-release frames for MQB are NOT publicly disclosed (cryptographically bound component protection). Separate keyless research: 'Dismantling Megamos Crypto' (Usenix 2016) broke VAG's transponder crypto — a DIFFERENT class (key cloning), not CAN injection.
- **Researcher-disclosed IDs:** ID 7FF (IMMO5 emulator ECU-auth, offline). Live immo-release/spoof IDs UNKNOWN.
- **Devices marketed (dark web):** VAG 'emergency start' / immo emulators on dark web + legit immo-off services (bench).
- **Mitigations:** IMMO5/MQB crypto; newer SecOC gateways; component protection.
- **References:** github.com/jrjoaoramos/mqbcan; github.com/iDoka/awesome-automotive-can-id (VAG); automodulelab.com VAG WFS5 immo emulator (research context); flaviodgarcia.com Dismantling Megamos Crypto (Usenix 2016); automotivetechinfo.com VW-Audi-Immobilizer-Key-Security.pdf; CVE-2023-29389 (CAN Injection, multi-OEM)

### BMW  (EU)

- **Key-auth bus:** FEM/BDC body domain controller (post-2014) replacing older CAS/ZGW gateway. PT-CAN, K-CAN, Body CAN, FlexRay.
- **Bitrate:** 500k (PT-CAN); newer = CAN-FD + SecOC on gateway
- **OBD pins:** 6 (CAN-H) / 14 (CAN-L)
- **Access points:**
  - OBD-II (driver lower dash, behind panel) — pins 6/14.
  - FEM/BDC module (footwell, driver side).
  - Head unit / Telematics Control Unit (remote attack surface per KeenLab).
- **Published frames:** KeenLab (Black Hat 2019): gained root on Head Unit, injected arbitrary CAN on K-CAN, used Central Gateway (FEM/BDC/ZGW) to relay UDS to other buses — remote unlock via NGTP/SMS (fixed by BMW OTA). Live PKE relay attacks well documented (physical, not frame-disclosure). Door/unlock frame IDs NOT disclosed for FEM; relay is the practical method.
- **Devices marketed (dark web):** BMW 'emergency start' devices on dark web; PKE relay boxes widely available.
- **Mitigations:** FEM/BDC crypto; SecOC gateway on newer; NGTP-over-SMS disabled OTA.
- **References:** keenlab.tencent.com/en/whitepapers/Experimental_Security_Assessment_of_BMW_Cars_by_KeenLab.pdf; i.blackhat.com/USA-19/.../0-Days-And-Mitigations-Roadways-To-Exploit-And-Secure-Connected-BMW-Cars-wp.pdf; github.com/iDoka/awesome-automotive-can-id (BMW)

### Mercedes-Benz  (EU)

- **Key-auth bus:** FBS4 immobilizer (W205/W206 era); body CAN + powertrain CAN via gateway
- **Bitrate:** 500k; newer = CAN-FD + SecOC
- **OBD pins:** 6 (CAN-H) / 14 (CAN-L)
- **Body CAN at OBD?:** Partial — body CAN at OBD via gateway; FBS4 immo traffic on internal bus.
- **Access points:**
  - OBD-II (driver knee panel, often hidden) — pins 6/14.
  - BCM / gateway behind dash.
- **Published frames:** UNKNOWN (FBS4 proprietary). Community DBs exist for older W203/W211 body modules (awesome-automotive-can-id). FBS4 immo-release frames NOT publicly disclosed. Reference: automotivetechinfo.com 'How the Mercedes-Benz Drive Authorization System 4 Works' documents DAS4 architecture (ELV + EIS + key transponder handshake).
- **Researcher-disclosed IDs:** None for FBS4 immo-release. Older W203/W211 body module frames in community DBs.
- **Devices marketed (dark web):** Mercedes 'emergency start' devices on dark web.
- **Mitigations:** FBS4 crypto; newer SecOC.
- **References:** github.com/iDoka/awesome-automotive-can-id (Mercedes-Benz); github.com/dvjcodec/Mercedes-Benz-CAN-BUS; automotivetechinfo.com How the Mercedes-Benz Drive Authorization System 4 Works; CVE-2023-29389 (CAN Injection, multi-OEM)

### Ford  (US)

- **Key-auth bus:** HS-CAN (powertrain/body) + MS-CAN (comfort, pins 3/11); 14th-gen F-150 uses CAN-FD + SecOC-protected gateway (harder).
- **Bitrate:** HS-CAN 500k; MS-CAN 125k; F-150 = CAN-FD + SecOC
- **OBD pins:** 6/14 (HS-CAN); 3/11 (MS-CAN)
- **Body CAN at OBD?:** Yes for HS/MS-CAN at OBD; F-150's SecOC gateway filters unauthorized frames.
- **Access points:**
  - OBD-II (driver lower dash, usually exposed) — pins 6/14 (HS-CAN), 3/11 (MS-CAN).
  - BCM / gateway module.
- **Published frames:** Community DBs: awesome-automotive-can-id (Ford, Fiesta MS-CAN 125k, Mustang). F-150 SecOC gateway + CAN-FD blocks naive injection (per jantman/ford-f150-gen14-can-bus-interface and ghostdev137 Ford PSCM RE — F-150 uses FD-CAN1/HS-CAN2/HS-CAN3/MS-CAN1 with SecOC). Live immo-release frames NOT disclosed.
- **Researcher-disclosed IDs:** None for immo-release. F-150 bus topology (FD-CAN/HS-CAN/MS-CAN) documented in jantman repo.
- **Devices marketed (dark web):** Ford 'emergency start' devices on dark web.
- **Mitigations:** CAN-FD + SecOC gateway (14th-gen F-150); harder than older Ford.
- **References:** github.com/iDoka/awesome-automotive-can-id (Ford); github.com/roncapat/Ford-Fiesta-MK5-MS-CAN-bus; github.com/jantman/ford-f150-gen14-can-bus-interface (F-150 wiring notes); ghostdev137.github.io/ford-pscm-re (F-150 PSCM RE); carhackingvillage.com DEF CON 31/33 talks; CVE-2023-29389 (CAN Injection, multi-OEM)

### Honda / Acura  (JP)

- **Key-auth bus:** Body/Comfort CAN + powertrain CAN (gateway)
- **Bitrate:** 500k (model dependent)
- **OBD pins:** 6/14
- **Access points:**
  - OBD-II (driver lower dash, varying position by year) — pins 6/14.
  - Body control module / gateway.
- **Published frames:** UNKNOWN (proprietary). Community DB: awesome-automotive-can-id (Honda, Civic 8th gen).
- **Devices marketed (dark web):** Honda 'emergency start' devices on dark web (per Tindell 100+ product market).
- **Mitigations:** Newer firmware; OBD lock.
- **References:** github.com/iDoka/awesome-automotive-can-id (Honda)

### Nissan / Infiniti  (JP)

- **Key-auth bus:** Single major 'CAN COMM' bus (500k, 11-bit) carrying BOTH body + powertrain (Qashqai J10, Juke, X-Trail, Sentra, 370Z; Leaf to lesser extent). BCM/UCH = NVIS/NATS immo + door locks.
- **Bitrate:** 500k (single merged bus)
- **OBD pins:** 6/14 — YES, the relevant body+powertrain bus is directly on the DLC.
- **Body CAN at OBD?:** Yes — single bus at OBD pins 6/14.
- **Access points:**
  - OBD-II DLC DIRECTLY — the 500k bus IS the one at the connector (key differentiator vs Toyota/Subaru).
  - Any edge harness on that bus (front bumper / headlight area) — same pattern as Toyota.
- **Published frames:** Public reverse-engineered DBC exists (balrog-kun/nissan-qashqai-can-info; comma.ai opendbc nissan_leaf_2018 / nissan_x_trail_2017). Body status frames mapped: headlights 0x60/0x625, engine start/stop switch 0x2079 (bit1 = ET691). Specific immo-release spoof frame: UNKNOWN (NATS release is BCM<->ECM OEM-proprietary, not in public DBC).
- **Researcher-disclosed IDs:** 0x60/0x625 (headlights), 0x2079 (engine start switch). Immo-release ID UNKNOWN.
- **Devices marketed (dark web):** Nissan 'emergency start' devices on dark web.
- **Mitigations:** Newer firmware; gateway.
- **References:** github.com/balrog-kun/nissan-qashqai-can-info; github.com/commaai/opendbc (Nissan DBCs); github.com/iDoka/awesome-automotive-can-id (Nissan, Leaf)

### Subaru  (JP)

- **Key-auth bus:** HS-CAN (powertrain 500k) + Body-CAN (125k) + dedicated immo line. BIU<->ECM on HS-CAN; BIU<->Combination Meter on 125k Body-CAN. Keyless Access CM on HS-CAN (pins B574-14/15).
- **Bitrate:** HS-CAN 500k; Body-CAN 125k
- **OBD pins:** 6/14 = HS-CAN (500k). Body-CAN (125k) NOT at DLC.
- **Body CAN at OBD?:** No — Body-CAN is internal; HS-CAN only at OBD.
- **Access points:**
  - Gateway / Body Integrated Unit (BIU) / Keyless Access CM (in-cabin) — internal buses NOT at OBD.
  - OBD-II (driver lower dash) — pins 6/14 = HS-CAN only.
  - No public edge (headlight/bumper) CAN-injection case documented for Subaru.
- **Published frames:** RESEARCHER-DISCLOSED (real, subaruoutback.org RE thread + amilanir GitHub): immobilizer handshake CAN ID 0x10 (BIU->CM) and 0x11 (CM->BIU) on 125k Body-CAN; door-lock state 0x375 on 500k HS-CAN (e.g. 03 00 = all unlocked). Exact immo-release payload semantics still hypothesized (looks like hash/checksum, not raw key).
- **Researcher-disclosed IDs:** 0x10 / 0x11 (BIU<->CM immo handshake); 0x375 (door lock state).
- **Devices marketed (dark web):** Subaru 'emergency start' devices on dark web.
- **Mitigations:** Newer firmware; gateway.
- **References:** subaruoutback.org/threads/immobilizer-reverse-engineering-2005-obxt; github.com/amilanir/Subaru-CAN-Reverse-Engineering; techinfo.subaru.com SSM4 immobilizer manual; github.com/iDoka/awesome-automotive-can-id (Subaru)

### Hyundai / Kia  (KR)

- **Key-auth bus:** IBU (Integrated Body Unit) + SMK (Smart Key) module. Chassis CAN (500k) + Body CAN (500k), Classical CAN + LIN. IBU/SMK manages immo release via EMS (engine ECU) over CAN (FCC CQOEG07170).
- **Bitrate:** 500k (body + chassis); newer = CAN-FD
- **OBD pins:** 6/14 = Body/Chassis CAN (500k), reachable at DLC.
- **Body CAN at OBD?:** Yes — body/chassis CAN at OBD pins 6/14.
- **Access points:**
  - OBD-II DLC — documented path for commercial 'emergency start' / key-emulator tools (e.g. ISKRA-3) that compute the immo PIN via the DLC and program a key/emulator (authorized only with proof of ownership).
  - IBU/SMK (in-cabin) and DLC both reach the 500k body/chassis CAN.
  - No Toyota-style edge headlight case documented.
- **Published frames:** UNKNOWN / PROPRIETARY. 'Emergency start' ecosystem (ISKRA-3, KKP OBD programmers) derives a PIN and writes keys via the diagnostic protocol — CAN IDs/payloads vendor-proprietary, not published. SEPARATE theft class (not CAN injection): 'Kia Boyz' USB-cable theft targets turn-key models WITHOUT a factory immobilizer (2017-2020 Elantra, 2015-2019 Sonata, 2020-2021 Venue) — 2023 Hyundai/Kia software patch added steering locks / modified turn-key logic.
- **Researcher-disclosed IDs:** None for immo-release. Separate: immobilizer-ABSENT design gap (Kia Boyz class).
- **Devices marketed (dark web):** Hyundai/Kia 'emergency start' devices (ISKRA-3 etc.) on dark web/commercial.
- **Mitigations:** Newer firmware + immobilizer additions (post-2021 US); OBD lock; 2023 software patch.
- **References:** FCC report CQOEG07170 (IBU/SMK architecture); BleepingComputer 2022-04 Hyundai/Kia USB-cable theft + 2023 patch; github.com/iDoka/awesome-automotive-can-id (Hyundai, Kia Soul OSCC)

### Mazda  (JP)

- **Key-auth bus:** HS-CAN (powertrain 500k) + MS-CAN (body 125k). Door locks/body on MS-CAN.
- **Bitrate:** HS 500k; MS 125k
- **OBD pins:** 6/14 = HS-CAN (500k). MS-CAN (125k, body/door) NOT at DLC.
- **Body CAN at OBD?:** No — MS-CAN body bus internal; HS-CAN only at OBD.
- **Access points:**
  - Gateway module (in-cabin) for body/MS-CAN functions. No public edge CAN-injection case.
  - OBD-II (driver lower dash) — pins 6/14 = HS-CAN only.
- **Published frames:** Public reverse-engineered DBC exists (majbthrd/MazdaCANbus SkyActiv+RX-8; madox.net). Maps body/door/comfort frames. Specific immo-release spoof command: UNKNOWN (Mazda SAS/IC+PCM+RKE release is OEM-proprietary, no public immo-release ID).
- **Researcher-disclosed IDs:** Public DBC maps body/door frames; immo-release ID UNKNOWN.
- **Devices marketed (dark web):** Mazda 'emergency start' devices on dark web.
- **Mitigations:** Newer firmware.
- **References:** github.com/majbthrd/MazdaCANbus; madox.net 'Reverse Engineering the Mazda CAN Bus'; github.com/iDoka/awesome-automotive-can-id (Mazda)

### PSA (Peugeot / Citroen / DS) + Renault  (EU/FR)

- **Key-auth bus:** Body/Comfort CAN (LS-CAN) + powertrain; PSA seed-key + immo algorithm
- **Bitrate:** 500k; comfort 125k
- **OBD pins:** 6/14
- **Body CAN at OBD?:** Partial — BSI body CAN reachable at OBD via gateway; immo traffic internal.
- **Access points:**
  - OBD-II (driver lower dash) — pins 6/14.
  - BSI (body computer) behind dash.
- **Published frames:** UNKNOWN for immo-release. Community DB: awesome-automotive-can-id (PSA, Renault Zoe). PSA seed-key + immobilizer algorithms are researched (prototux/PSA-CAN-RE, prototux/PSA-RE seed-key/immo algorithm) but not a live 'unlock' frame disclosure. Renault: cartools.lv RENAULT_CAN emulator connects to PT-CAN for ECU start authorization (Hitag-2 keycards) — offline emulator territory, not a documented live frame.
- **Researcher-disclosed IDs:** None for immo-release. Renault PT-CAN emulator documented (cartools.lv); PSA seed-key researched.
- **Devices marketed (dark web):** PSA/Renault 'emergency start' devices on dark web.
- **Mitigations:** Newer firmware; seed-key.
- **References:** github.com/iDoka/awesome-automotive-can-id (PSA, Renault); github.com/prototux/PSA-CAN-RE-old (PSA CAN bus RE); github.com/prototux/PSA-RE (seed-key / immo algorithm); cartools.lv RENAULT_CAN emulator (PT-CAN start authorization); CVE-2023-29389 (CAN Injection, multi-OEM)
