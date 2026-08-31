#!/usr/bin/env python3
"""
CAN Injection Research Database builder.

Produces:
  - database.json   : structured per-make data (machine readable)
  - DATABASE.md     : human-readable master reference
  - wire_colors.md  : OE CAN wire colour chart (verify-do-not-assume)
  - hardware.md     : CAN sniffing/injection hardware comparison
  - references.md    : consolidated source list

Authorized-use context: built for a LICENSED automotive locksmith / technician
for emergency-access research, immobilizer study, and anti-theft defence.
"""

import json
import os
import datetime

HERE = os.path.dirname(os.path.abspath(__file__))

META = {
    "title": "CAN Injection / Keyless-Defeat Research Database",
    "purpose": "Authorized reference for emergency access, immobilizer research, anti-theft defence.",
    "legal_note": (
        "CAN injection is a documented vehicle-theft technique. This database is compiled for "
        "LICENSED automotive locksmiths / technicians performing authorized work (emergency access, "
        "immobilizer study, customer anti-theft advice). Reverse-engineering or defeating a vehicle's "
        "security on a vehicle you are not authorized to work on is illegal. Frame data marked UNKNOWN "
        "is genuinely unknown to public research — do not fabricate it."
    ),
    "core_technique": (
        "CAN injection = tap the CAN bus that the smart-key receiver ECU sits on, then inject forged "
        "frames impersonating the keyless receiver ('key validated / immobilizer release / unlock / "
        "start'). A gateway ECU copies the message to the powertrain bus; the immobilizer releases. "
        "Body-CAN messages are plaintext in most pre-2023/2024 cars. "
        "There is NO universal static 'frame X opens door on make Y' table: frames are proprietary per "
        "OEM and change by model year. The real research value is WHICH bus, WHERE it's reachable, and "
        "the METHOD to extract specific frames (signal capture / reverse engineering)."
    ),
    "standard_obd": "OBD-II pin 6 = CAN-High, pin 14 = CAN-Low, pin 4/5 = ground, pin 16 = +12V.",
    "built": datetime.date.today().isoformat(),
    "canonical_frame_repo": "https://github.com/iDoka/awesome-automotive-can-id",
    "primary_sources": [
        "Ken Tindell, 'CAN Injection: keyless car theft' (kentindell.github.io/2023/04/03/can-injection/)",
        "Tesla Model 3/Y CVE-2025-6785 (physical CAN injection, fixed in firmware 2023.44)",
        "KeenLab 'Experimental Security Assessment of BMW Cars' (Black Hat USA 2019)",
        "iDoka/awesome-automotive-can-id (community per-make CAN ID databases)",
    ],
}

# Per-make entries. 'frames' = published unlock/immobilizer/start frames actually
# disclosed by researchers. Use "UNKNOWN" where proprietary / not publicly disclosed.
MAKES = [
    {
        "make": "Toyota / Lexus",
        "regions": "JP",
        "key_auth_bus": "Body/Control CAN (smart-key receiver ECU bus)",
        "bitrate": "500k (model dependent)",
        "access_points": [
            "HEADLIGHT CONNECTOR (documented): thieves reached the 'control CAN' via the front headlight "
            "harness on RAV4 — confirmed by Ken Tindell's forensic analysis of a real theft.",
            "OBD-II port (under dash, left of steering column, often exposed) — pins 6/14.",
            "Gateway / DLC behind lower dash.",
        ],
        "obd_pins": "6 (CAN-H) / 14 (CAN-L)",
        "body_can_at_obd": "No — body/smart-key 'control CAN' is NOT on OBD pins 6/14; reached via headlight harness.",
        "frames": (
            "UNKNOWN (proprietary). Tindell disclosed the TECHNIQUE only — the device listens for a "
            "specific wake CAN frame, then bursts ~20 spoof 'key valid' frames/sec impersonating the "
            "smart-key ECU, plus a separate 'unlock' frame on pressing the speaker's Play button. The "
            "exact CAN IDs/payloads were NOT published (deliberately, to protect owners)."
        ),
        "disclosed_ids": "None published. CVE-2023-29389 (CAN Injection, multi-OEM incl. Toyota/Lexus) is the tracking CVE.",
        "references": [
            "kentindell.github.io/2023/04/03/can-injection/",
            "can-cia.org CAN Newsletter June 2023: The CAN Injection attack (Ken Tindell, Canis Labs)",
            "CVE-2023-29389",
            "awesome-automotive-can-id -> Toyota, Lexus sections",
        ],
        "devices_marketed": (
            "Dark-web 'emergency start' devices targeting Toyota/Lexus (RAV4, Land Cruiser, Prius, "
            "Highlander, GR Supra, plus Lexus ES/LC/LS/NX/RX) — per Tindell. Sold disguised as a JBL Bluetooth speaker."
        ),
        "mitigations": "Newer Toyota firmware; key-fob sleep; OBD-port lock; gateway segmentation + SecOC/CryptoCAN.",
    },
    {
        "make": "Tesla",
        "regions": "US",
        "key_auth_bus": "Body CAN reachable via externally available CAN wires",
        "bitrate": "500k (CAN-FD on newer)",
        "access_points": [
            "OBD-style connector BEHIND REAR SEAT (Model 3) — PlaxidityX connected a home-made device "
            "here and shifted to drive + started engine (CVE-2025-6785).",
            "Externally available CAN wires at the vehicle edge.",
        ],
        "obd_pins": "N/A (non-standard Tesla diagnostic connector, center armrest)",
        "frames": (
            "CVE-2025-6785: injection of specially-formed CAN messages to control remote-start / shift "
            "to drive / start engine. Affected Model 3 software < 2023.44; also Model Y. FIXED in "
            "firmware 2023.44. Exact message construction NOT disclosed publicly."
        ),
        "references": [
            "CVE-2025-6785 / GHSA-wqqj-jmr5-3p39",
            "plaxidityx.com/blog/blog-post/tesla-keyless-car-theft-can-injection-vulnerability/",
        ],
        "devices_marketed": "UNKNOWN (researcher-built device used in disclosure).",
        "mitigations": "Firmware 2023.44+ eliminates this specific path; keep Tesla updated.",
    },
    {
        "make": "Volkswagen / Audi (VAG)",
        "regions": "EU",
        "key_auth_bus": (
            "Comfort/Body CAN (100k or 500k) + Powertrain CAN (500k), routed by Gateway Module 19 "
            "(J533). IMMO lives in cluster/BCM/Kessy; IMMO4 (pre-2010, AES-128 rolling), IMMO5 "
            "(post-2010, encrypted) on MQB."
        ),
        "bitrate": "Powertrain 500k; Comfort 100k/500k; newer = CAN-FD + SecOC",
        "access_points": [
            "OBD-II (driver lower dash, usually behind cover) — pins 6/14 reach powertrain CAN via gateway.",
            "VW-specific: pin 1/9 carry older Comfort CAN on some models.",
            "Radio Quadlock connector (infotainment bus tap) per mqbcan project.",
            "BCM / gateway module location varies by model.",
        ],
        "obd_pins": "6 (CAN-H) / 14 (CAN-L); 1/9 (older comfort CAN)",
        "body_can_at_obd": "Partial — powertrain CAN at OBD via gateway; comfort/body CAN reachable at node (BCM/gateway), older models on pins 1/9.",
        "frames": (
            "Community DBs exist (awesome-automotive-can-id VW/Audi, mqbcan, VW_Flash). "
            "IMMO5 emulator research shows 3 CAN messages (ID 7FF) for ECU authorization — but this is "
            "offline-emulator territory, NOT a live 'unlock door' frame. Live immo-release frames for "
            "MQB are NOT publicly disclosed (cryptographically bound component protection). "
            "Separate keyless research: 'Dismantling Megamos Crypto' (Usenix 2016) broke VAG's "
            "transponder crypto — a DIFFERENT class (key cloning), not CAN injection."
        ),
        "disclosed_ids": "ID 7FF (IMMO5 emulator ECU-auth, offline). Live immo-release/spoof IDs UNKNOWN.",
        "references": [
            "github.com/jrjoaoramos/mqbcan",
            "github.com/iDoka/awesome-automotive-can-id (VAG)",
            "automodulelab.com VAG WFS5 immo emulator (research context)",
            "flaviodgarcia.com Dismantling Megamos Crypto (Usenix 2016)",
            "automotivetechinfo.com VW-Audi-Immobilizer-Key-Security.pdf",
            "CVE-2023-29389 (CAN Injection, multi-OEM)",
        ],
        "devices_marketed": "VAG 'emergency start' / immo emulators on dark web + legit immo-off services (bench).",
        "mitigations": "IMMO5/MQB crypto; newer SecOC gateways; component protection.",
    },
    {
        "make": "BMW",
        "regions": "EU",
        "key_auth_bus": (
            "FEM/BDC body domain controller (post-2014) replacing older CAS/ZGW gateway. "
            "PT-CAN, K-CAN, Body CAN, FlexRay."
        ),
        "bitrate": "500k (PT-CAN); newer = CAN-FD + SecOC on gateway",
        "access_points": [
            "OBD-II (driver lower dash, behind panel) — pins 6/14.",
            "FEM/BDC module (footwell, driver side).",
            "Head unit / Telematics Control Unit (remote attack surface per KeenLab).",
        ],
        "obd_pins": "6 (CAN-H) / 14 (CAN-L)",
        "frames": (
            "KeenLab (Black Hat 2019): gained root on Head Unit, injected arbitrary CAN on K-CAN, used "
            "Central Gateway (FEM/BDC/ZGW) to relay UDS to other buses — remote unlock via NGTP/SMS "
            "(fixed by BMW OTA). Live PKE relay attacks well documented (physical, not frame-disclosure). "
            "Door/unlock frame IDs NOT disclosed for FEM; relay is the practical method."
        ),
        "references": [
            "keenlab.tencent.com/en/whitepapers/Experimental_Security_Assessment_of_BMW_Cars_by_KeenLab.pdf",
            "i.blackhat.com/USA-19/.../0-Days-And-Mitigations-Roadways-To-Exploit-And-Secure-Connected-BMW-Cars-wp.pdf",
            "github.com/iDoka/awesome-automotive-can-id (BMW)",
        ],
        "devices_marketed": "BMW 'emergency start' devices on dark web; PKE relay boxes widely available.",
        "mitigations": "FEM/BDC crypto; SecOC gateway on newer; NGTP-over-SMS disabled OTA.",
    },
    {
        "make": "Mercedes-Benz",
        "regions": "EU",
        "key_auth_bus": "FBS4 immobilizer (W205/W206 era); body CAN + powertrain CAN via gateway",
        "bitrate": "500k; newer = CAN-FD + SecOC",
        "access_points": [
            "OBD-II (driver knee panel, often hidden) — pins 6/14.",
            "BCM / gateway behind dash.",
        ],
        "obd_pins": "6 (CAN-H) / 14 (CAN-L)",
        "body_can_at_obd": "Partial — body CAN at OBD via gateway; FBS4 immo traffic on internal bus.",
        "frames": (
            "UNKNOWN (FBS4 proprietary). Community DBs exist for older W203/W211 body modules "
            "(awesome-automotive-can-id). FBS4 immo-release frames NOT publicly disclosed. "
            "Reference: automotivetechinfo.com 'How the Mercedes-Benz Drive Authorization System 4 "
            "Works' documents DAS4 architecture (ELV + EIS + key transponder handshake)."
        ),
        "disclosed_ids": "None for FBS4 immo-release. Older W203/W211 body module frames in community DBs.",
        "references": [
            "github.com/iDoka/awesome-automotive-can-id (Mercedes-Benz)",
            "github.com/dvjcodec/Mercedes-Benz-CAN-BUS",
            "automotivetechinfo.com How the Mercedes-Benz Drive Authorization System 4 Works",
            "CVE-2023-29389 (CAN Injection, multi-OEM)",
        ],
        "devices_marketed": "Mercedes 'emergency start' devices on dark web.",
        "mitigations": "FBS4 crypto; newer SecOC.",
    },
    {
        "make": "Ford",
        "regions": "US",
        "key_auth_bus": (
            "HS-CAN (powertrain/body) + MS-CAN (comfort, pins 3/11); 14th-gen F-150 uses CAN-FD + "
            "SecOC-protected gateway (harder)."
        ),
        "bitrate": "HS-CAN 500k; MS-CAN 125k; F-150 = CAN-FD + SecOC",
        "access_points": [
            "OBD-II (driver lower dash, usually exposed) — pins 6/14 (HS-CAN), 3/11 (MS-CAN).",
            "BCM / gateway module.",
        ],
        "obd_pins": "6/14 (HS-CAN); 3/11 (MS-CAN)",
        "body_can_at_obd": "Yes for HS/MS-CAN at OBD; F-150's SecOC gateway filters unauthorized frames.",
        "frames": (
            "Community DBs: awesome-automotive-can-id (Ford, Fiesta MS-CAN 125k, Mustang). F-150 SecOC "
            "gateway + CAN-FD blocks naive injection (per jantman/ford-f150-gen14-can-bus-interface and "
            "ghostdev137 Ford PSCM RE — F-150 uses FD-CAN1/HS-CAN2/HS-CAN3/MS-CAN1 with SecOC). "
            "Live immo-release frames NOT disclosed."
        ),
        "disclosed_ids": "None for immo-release. F-150 bus topology (FD-CAN/HS-CAN/MS-CAN) documented in jantman repo.",
        "references": [
            "github.com/iDoka/awesome-automotive-can-id (Ford)",
            "github.com/roncapat/Ford-Fiesta-MK5-MS-CAN-bus",
            "github.com/jantman/ford-f150-gen14-can-bus-interface (F-150 wiring notes)",
            "ghostdev137.github.io/ford-pscm-re (F-150 PSCM RE)",
            "carhackingvillage.com DEF CON 31/33 talks",
            "CVE-2023-29389 (CAN Injection, multi-OEM)",
        ],
        "devices_marketed": "Ford 'emergency start' devices on dark web.",
        "mitigations": "CAN-FD + SecOC gateway (14th-gen F-150); harder than older Ford.",
    },
    {
        "make": "Honda / Acura",
        "regions": "JP",
        "key_auth_bus": "Body/Comfort CAN + powertrain CAN (gateway)",
        "bitrate": "500k (model dependent)",
        "access_points": [
            "OBD-II (driver lower dash, varying position by year) — pins 6/14.",
            "Body control module / gateway.",
        ],
        "obd_pins": "6/14",
        "frames": "UNKNOWN (proprietary). Community DB: awesome-automotive-can-id (Honda, Civic 8th gen).",
        "references": ["github.com/iDoka/awesome-automotive-can-id (Honda)"],
        "devices_marketed": "Honda 'emergency start' devices on dark web (per Tindell 100+ product market).",
        "mitigations": "Newer firmware; OBD lock.",
    },
    {
        "make": "Nissan / Infiniti",
        "regions": "JP",
        "key_auth_bus": (
            "Single major 'CAN COMM' bus (500k, 11-bit) carrying BOTH body + powertrain (Qashqai J10, "
            "Juke, X-Trail, Sentra, 370Z; Leaf to lesser extent). BCM/UCH = NVIS/NATS immo + door locks."
        ),
        "bitrate": "500k (single merged bus)",
        "access_points": [
            "OBD-II DLC DIRECTLY — the 500k bus IS the one at the connector (key differentiator vs Toyota/Subaru).",
            "Any edge harness on that bus (front bumper / headlight area) — same pattern as Toyota.",
        ],
        "obd_pins": "6/14 — YES, the relevant body+powertrain bus is directly on the DLC.",
        "body_can_at_obd": "Yes — single bus at OBD pins 6/14.",
        "frames": (
            "Public reverse-engineered DBC exists (balrog-kun/nissan-qashqai-can-info; comma.ai opendbc "
            "nissan_leaf_2018 / nissan_x_trail_2017). Body status frames mapped: headlights 0x60/0x625, "
            "engine start/stop switch 0x2079 (bit1 = ET691). Specific immo-release spoof frame: UNKNOWN "
            "(NATS release is BCM<->ECM OEM-proprietary, not in public DBC)."
        ),
        "disclosed_ids": "0x60/0x625 (headlights), 0x2079 (engine start switch). Immo-release ID UNKNOWN.",
        "references": [
            "github.com/balrog-kun/nissan-qashqai-can-info",
            "github.com/commaai/opendbc (Nissan DBCs)",
            "github.com/iDoka/awesome-automotive-can-id (Nissan, Leaf)",
        ],
        "devices_marketed": "Nissan 'emergency start' devices on dark web.",
        "mitigations": "Newer firmware; gateway.",
    },
    {
        "make": "Subaru",
        "regions": "JP",
        "key_auth_bus": (
            "HS-CAN (powertrain 500k) + Body-CAN (125k) + dedicated immo line. BIU<->ECM on HS-CAN; "
            "BIU<->Combination Meter on 125k Body-CAN. Keyless Access CM on HS-CAN (pins B574-14/15)."
        ),
        "bitrate": "HS-CAN 500k; Body-CAN 125k",
        "access_points": [
            "Gateway / Body Integrated Unit (BIU) / Keyless Access CM (in-cabin) — internal buses NOT at OBD.",
            "OBD-II (driver lower dash) — pins 6/14 = HS-CAN only.",
            "No public edge (headlight/bumper) CAN-injection case documented for Subaru.",
        ],
        "obd_pins": "6/14 = HS-CAN (500k). Body-CAN (125k) NOT at DLC.",
        "body_can_at_obd": "No — Body-CAN is internal; HS-CAN only at OBD.",
        "frames": (
            "RESEARCHER-DISCLOSED (real, subaruoutback.org RE thread + amilanir GitHub): "
            "immobilizer handshake CAN ID 0x10 (BIU->CM) and 0x11 (CM->BIU) on 125k Body-CAN; "
            "door-lock state 0x375 on 500k HS-CAN (e.g. 03 00 = all unlocked). Exact immo-release "
            "payload semantics still hypothesized (looks like hash/checksum, not raw key)."
        ),
        "disclosed_ids": "0x10 / 0x11 (BIU<->CM immo handshake); 0x375 (door lock state).",
        "references": [
            "subaruoutback.org/threads/immobilizer-reverse-engineering-2005-obxt",
            "github.com/amilanir/Subaru-CAN-Reverse-Engineering",
            "techinfo.subaru.com SSM4 immobilizer manual",
            "github.com/iDoka/awesome-automotive-can-id (Subaru)",
        ],
        "devices_marketed": "Subaru 'emergency start' devices on dark web.",
        "mitigations": "Newer firmware; gateway.",
    },
    {
        "make": "Hyundai / Kia",
        "regions": "KR",
        "key_auth_bus": (
            "IBU (Integrated Body Unit) + SMK (Smart Key) module. Chassis CAN (500k) + Body CAN (500k), "
            "Classical CAN + LIN. IBU/SMK manages immo release via EMS (engine ECU) over CAN (FCC CQOEG07170)."
        ),
        "bitrate": "500k (body + chassis); newer = CAN-FD",
        "access_points": [
            "OBD-II DLC — documented path for commercial 'emergency start' / key-emulator tools (e.g. ISKRA-3) "
            "that compute the immo PIN via the DLC and program a key/emulator (authorized only with proof of ownership).",
            "IBU/SMK (in-cabin) and DLC both reach the 500k body/chassis CAN.",
            "No Toyota-style edge headlight case documented.",
        ],
        "obd_pins": "6/14 = Body/Chassis CAN (500k), reachable at DLC.",
        "body_can_at_obd": "Yes — body/chassis CAN at OBD pins 6/14.",
        "frames": (
            "UNKNOWN / PROPRIETARY. 'Emergency start' ecosystem (ISKRA-3, KKP OBD programmers) derives a PIN "
            "and writes keys via the diagnostic protocol — CAN IDs/payloads vendor-proprietary, not published. "
            "SEPARATE theft class (not CAN injection): 'Kia Boyz' USB-cable theft targets turn-key models "
            "WITHOUT a factory immobilizer (2017-2020 Elantra, 2015-2019 Sonata, 2020-2021 Venue) — 2023 "
            "Hyundai/Kia software patch added steering locks / modified turn-key logic."
        ),
        "disclosed_ids": "None for immo-release. Separate: immobilizer-ABSENT design gap (Kia Boyz class).",
        "references": [
            "FCC report CQOEG07170 (IBU/SMK architecture)",
            "BleepingComputer 2022-04 Hyundai/Kia USB-cable theft + 2023 patch",
            "github.com/iDoka/awesome-automotive-can-id (Hyundai, Kia Soul OSCC)",
        ],
        "devices_marketed": "Hyundai/Kia 'emergency start' devices (ISKRA-3 etc.) on dark web/commercial.",
        "mitigations": "Newer firmware + immobilizer additions (post-2021 US); OBD lock; 2023 software patch.",
    },
    {
        "make": "Mazda",
        "regions": "JP",
        "key_auth_bus": "HS-CAN (powertrain 500k) + MS-CAN (body 125k). Door locks/body on MS-CAN.",
        "bitrate": "HS 500k; MS 125k",
        "access_points": [
            "Gateway module (in-cabin) for body/MS-CAN functions. No public edge CAN-injection case.",
            "OBD-II (driver lower dash) — pins 6/14 = HS-CAN only.",
        ],
        "obd_pins": "6/14 = HS-CAN (500k). MS-CAN (125k, body/door) NOT at DLC.",
        "body_can_at_obd": "No — MS-CAN body bus internal; HS-CAN only at OBD.",
        "frames": (
            "Public reverse-engineered DBC exists (majbthrd/MazdaCANbus SkyActiv+RX-8; madox.net). Maps "
            "body/door/comfort frames. Specific immo-release spoof command: UNKNOWN (Mazda SAS/IC+PCM+RKE "
            "release is OEM-proprietary, no public immo-release ID)."
        ),
        "disclosed_ids": "Public DBC maps body/door frames; immo-release ID UNKNOWN.",
        "references": [
            "github.com/majbthrd/MazdaCANbus",
            "madox.net 'Reverse Engineering the Mazda CAN Bus'",
            "github.com/iDoka/awesome-automotive-can-id (Mazda)",
        ],
        "devices_marketed": "Mazda 'emergency start' devices on dark web.",
        "mitigations": "Newer firmware.",
    },
    {
        "make": "PSA (Peugeot / Citroen / DS) + Renault",
        "regions": "EU/FR",
        "key_auth_bus": "Body/Comfort CAN (LS-CAN) + powertrain; PSA seed-key + immo algorithm",
        "bitrate": "500k; comfort 125k",
        "access_points": ["OBD-II (driver lower dash) — pins 6/14.", "BSI (body computer) behind dash."],
        "obd_pins": "6/14",
        "body_can_at_obd": "Partial — BSI body CAN reachable at OBD via gateway; immo traffic internal.",
        "frames": (
            "UNKNOWN for immo-release. Community DB: awesome-automotive-can-id (PSA, Renault Zoe). "
            "PSA seed-key + immobilizer algorithms are researched (prototux/PSA-CAN-RE, prototux/PSA-RE "
            "seed-key/immo algorithm) but not a live 'unlock' frame disclosure. Renault: cartools.lv "
            "RENAULT_CAN emulator connects to PT-CAN for ECU start authorization (Hitag-2 keycards) — "
            "offline emulator territory, not a documented live frame."
        ),
        "disclosed_ids": "None for immo-release. Renault PT-CAN emulator documented (cartools.lv); PSA seed-key researched.",
        "references": [
            "github.com/iDoka/awesome-automotive-can-id (PSA, Renault)",
            "github.com/prototux/PSA-CAN-RE-old (PSA CAN bus RE)",
            "github.com/prototux/PSA-RE (seed-key / immo algorithm)",
            "cartools.lv RENAULT_CAN emulator (PT-CAN start authorization)",
            "CVE-2023-29389 (CAN Injection, multi-OEM)",
        ],
        "devices_marketed": "PSA/Renault 'emergency start' devices on dark web.",
        "mitigations": "Newer firmware; seed-key.",
    },
]

# OE CAN wire colours. CRITICAL: NOT standardised — verify with DMM every time.
WIRE_COLORS = [
    ("Alfa Romeo", "Pink/black", "Pink/white"),
    ("Audi (Infotainment)", "Orange/purple", "Orange/brown"),
    ("Audi (Comfort)", "Orange/green", "Orange/brown"),
    ("Bentley (Infotainment)", "Orange/purple", "Orange/brown"),
    ("Bentley (Comfort)", "Orange/green", "Orange/brown"),
    ("BMW 1 & 3 series", "Green/orange", "Green"),
    ("BMW 5 & 6 series", "Black", "Yellow"),
    ("Chrysler / Dodge / Jeep", "White/Orange", "White"),
    ("Citroen", "Harness cable 9001", "Harness cable 9000"),
    ("Fiat / Lancia / Iveco", "Pink/black", "Pink/white"),
    ("Ford", "Grey or blue/grey", "Blue or purple/grey"),
    ("Mercedes", "Brown/red", "Brown"),
    ("Peugeot", "Harness cable 9001", "Harness cable 9000"),
    ("Porsche", "Yellow", "Black"),
    ("Seat (Infotainment/Comfort)", "Orange/purple or /green", "Orange/brown"),
    ("Skoda (Infotainment/Comfort)", "Orange/purple or /green", "Orange/brown"),
    ("Vauxhall/Opel", "Green", "White"),
    ("Volkswagen (Infotainment)", "Orange/purple", "Orange/brown"),
    ("Volkswagen (Comfort)", "Orange/green", "Orange/brown"),
    ("Volkswagen (Powertrain)", "Orange/black", "Orange/brown"),
    ("Volvo", "White", "Green"),
    ("Subaru BRZ/GR86 (SAS conn.)", "Green", "Pink"),
    ("Toyota (general)", "UNKNOWN — use DMM", "UNKNOWN — use DMM"),
    ("Honda/Nissan/Mazda/Hyundai/Kia", "UNKNOWN — use DMM", "UNKNOWN — use DMM"),
]

HARDWARE = [
    {
        "name": "CANable 2.0 Pro",
        "price": "~US$40-60",
        "interface": "USB-C, SocketCAN (candleLight firmware), Linux native",
        "pros": "Isolated, CAN-FD support, plug-and-play on Linux, python-can + can-utils.",
        "cons": "Needs Linux host (or WSL); known reset hardware quirk on MKS variant.",
        "use": "Primary sniff + inject tool on this rig.",
    },
    {
        "name": "CANable (non-Pro)",
        "price": "~US$25-35",
        "interface": "USB, SocketCAN (slcan/candleLight)",
        "pros": "Cheap, small.",
        "cons": "No isolation; same reset quirk.",
        "use": "Bench / low-risk taps.",
    },
    {
        "name": "CANPico + CANHack (Canis Labs / Ken Tindell)",
        "price": "~US$30 + Pico",
        "interface": "Raspberry Pi Pico carrier, MicroPython SDK",
        "pros": "CAN fault/error injection (CANHack), µs timestamps, scope/LA headers, listen-only jumper.",
        "cons": "MicroPython dev; not a plug-and-play dongle.",
        "use": "Research / fault-injection, protocol-level security testing.",
    },
    {
        "name": "Raspberry Pi Pico + MCP2515/SN65HVD23x",
        "price": "~US$10-20",
        "interface": "SPI CAN controller + transceiver",
        "pros": "DIY, cheap, flexible.",
        "cons": "Wiring + code required.",
        "use": "Custom emulators / logging.",
    },
    {
        "name": "ESP32 + CAN transceiver (TWAI)",
        "price": "~US$8-15",
        "interface": "ESP32 TWAI peripheral + transceiver",
        "pros": "WiFi/BLE link for remote relay; cheap.",
        "cons": "3.3V logic; level concerns.",
        "use": "Wireless relay / field logging.",
    },
    {
        "name": "Macchina M2",
        "price": "~US$99 (dev kit)",
        "interface": "Arduino Due core; 2x CAN, SWCAN, LIN, J1850; OBD-II dongle or under-hood",
        "pros": "Multi-protocol, SavvyCAN support, SD logging, XBee wireless socket.",
        "cons": "Larger; software still maturing.",
        "use": "All-in-one automotive hacking platform.",
    },
    {
        "name": "Tactrix OpenPort 2.0",
        "price": "~US$170",
        "interface": "J2534 pass-through (USB)",
        "pros": "Reflash/diagnostic focus, Subaru/Toyota strong.",
        "cons": "J2534 (not raw SocketCAN); Windows-centric.",
        "use": "Reflash + OEM diag, not generic injection.",
    },
    {
        "name": "Commercial 'emergency start' theft devices",
        "price": "up to €5000 on dark web",
        "interface": "Hidden in consumer items (e.g. JBL speaker); PIC + CAN transceiver",
        "pros": "N/A (attacker tooling).",
        "cons": "ILLEGAL to use/own for theft; understand only to advise customers / defence.",
        "use": "DEFENSIVE AWARENESS ONLY — know what customers are exposed to.",
    },
    {
        "name": "Software: SavvyCAN, can-utils (candump/cansend), Wireshark, python-can",
        "price": "Free",
        "interface": "Host tools",
        "pros": "Capture, filter, replay, DBC decode.",
        "cons": "Learning curve.",
        "use": "Analysis + replay of captured frames.",
    },
]

THREAT = {
    "market": (
        "Ken Tindell documented 100+ products on dark-web sites bypassing car security — fake key "
        "fobs and 'emergency start' devices (falsely marketed as for owners who lost keys / locksmiths). "
        "Prices up to €5000. Targets include Jeep, Maserati, Honda, Renault, Jaguar, Fiat, Peugeot, "
        "Nissan, Ford, BMW, VW, Chrysler, Cadillac, GMC, Toyota/Lexus."
    ),
    "mitigations": [
        "SecOC (Secure Onboard Communication) — authenticated/encrypted CAN messages (newer VAG, BMW, F-150).",
        "Authenticated gateways — reject unauthorised frames.",
        "CAN-FD — higher speed + harder to inject naively.",
        "Key-fob motion sensors / sleep mode — defeats PKE relay.",
        "OBD-II port locks / CAN shields — block physical tap at the port.",
        "Firmware updates — e.g. Tesla 2023.44 fixed CVE-2025-6785.",
        "Customer advice: OBD port lock, faraday pouch for keys, keep firmware current, CAN-bus intrusion detection.",
    ],
}


def _norm(v):
    if isinstance(v, tuple):
        return " ".join(v)
    return v


def build_json():
    makes_out = []
    for m in MAKES:
        makes_out.append({k: _norm(v) for k, v in m.items()})
    db = {
        "meta": META,
        "makes": makes_out,
        "wire_colors": [
            {"manufacturer": m, "can_high": h, "can_low": l} for (m, h, l) in WIRE_COLORS
        ],
        "hardware": HARDWARE,
        "threat_landscape": THREAT,
    }
    out = os.path.join(HERE, "database.json")
    with open(out, "w") as f:
        json.dump(db, f, indent=2)
    return out


def build_markdown():
    lines = []
    lines.append("# CAN Injection / Keyless-Defeat Research Database\n")
    lines.append("> " + META["legal_note"] + "\n")
    lines.append("## Core Technique\n")
    lines.append(META["core_technique"] + "\n")
    lines.append("**" + META["standard_obd"] + "**\n")
    lines.append("Canonical per-make frame database: " + META["canonical_frame_repo"] + "\n")
    lines.append("\n## Per-Make Reference\n")
    for m in MAKES:
        lines.append("### " + m["make"] + "  (" + m["regions"] + ")\n")
        lines.append("- **Key-auth bus:** " + m["key_auth_bus"])
        lines.append("- **Bitrate:** " + m["bitrate"])
        lines.append("- **OBD pins:** " + m["obd_pins"])
        if "body_can_at_obd" in m:
            lines.append("- **Body CAN at OBD?:** " + m["body_can_at_obd"])
        lines.append("- **Access points:**")
        for a in m["access_points"]:
            lines.append("  - " + a)
        frames = m["frames"]
        if isinstance(frames, tuple):
            frames = " ".join(frames)
        lines.append("- **Published frames:** " + frames)
        if "disclosed_ids" in m:
            lines.append("- **Researcher-disclosed IDs:** " + m["disclosed_ids"])
        lines.append("- **Devices marketed (dark web):** " + m["devices_marketed"])
        lines.append("- **Mitigations:** " + m["mitigations"])
        lines.append("- **References:** " + "; ".join(m["references"]))
        lines.append("")
    return "\n".join(lines)


def main():
    j = build_json()
    print("Wrote", j)
    md = build_markdown()
    with open(os.path.join(HERE, "DATABASE.md"), "w") as f:
        f.write(md)
    print("Wrote DATABASE.md")
    # wire_colors.md
    wc = ["# OE CAN Wire Colour Chart\n",
          "> CRITICAL: wire colours are NOT standardised. They vary by model year and harness. "
          "**ALWAYS verify with a multimeter** (resistance ~60Ω between H and L on a terminated bus; "
          "idle ~3.5V on CAN-H, ~2.5V on CAN-L; both ~2.5V recessive). Do not assume.\n",
          "",
          "| Manufacturer | CAN-High | CAN-Low |",
          "| --- | --- | --- |"]
    for (m, h, l) in WIRE_COLORS:
        wc.append("| " + m + " | " + h + " | " + l + " |")
    wc.append("")
    wc.append("## Notes (from OEM / reverse-engineering sources)")
    wc.append("- **VAG (VW/Audi/SEAT/Skoda):** consistent 'Orange + tracer' scheme — **brown = CAN-L "
              "everywhere**; the tracer on the orange wire tells the domain: black = powertrain, "
              "green = comfort, violet = infotainment.")
    wc.append("- **Schematic vs harness:** diagnostic literature sometimes draws CAN as yellow(H)/green(L) "
              "— that is the VAS 5051 / SSP diagram convention, NOT the physical wire colour. Don't confuse "
              "schematic colours with harness colours.")
    wc.append("- **Toyota / Honda / Nissan / Kia / Mitsubishi:** no reliable public colour mapping — "
              "marked UNKNOWN, verify with DMM every time.")
    wc.append("- See **dmm_verify.md** for the confirmation procedure before you cut or tap any wire.")
    with open(os.path.join(HERE, "wire_colors.md"), "w") as f:
        f.write("\n".join(wc) + "\n")
    print("Wrote wire_colors.md")
    # hardware.md
    hw = ["# CAN Sniffing / Injection Hardware\n",
          "",
          "| Device | Price | Interface | Pros | Cons | Use |",
          "| --- | --- | --- | --- | --- | --- |"]
    for h in HARDWARE:
        hw.append("| " + h["name"] + " | " + h["price"] + " | " + h["interface"] +
                  " | " + h["pros"] + " | " + h["cons"] + " | " + h["use"] + " |")
    with open(os.path.join(HERE, "hardware.md"), "w") as f:
        f.write("\n".join(hw) + "\n")
    print("Wrote hardware.md")
    # references.md
    refs = ["# References\n", ""]
    refs.append("## Primary technique & vulnerability sources")
    for s in META["primary_sources"]:
        refs.append("- " + s)
    refs.append("")
    refs.append("## Standalone reference files (in this directory)")
    refs.append("- **DATABASE.md** — per-make CAN bus / access / frames reference (this build)")
    refs.append("- **wire_colors.md** — OE CAN wire colour chart (verify-do-not-assume)")
    refs.append("- **hardware.md** — CAN sniff/inject hardware comparison")
    refs.append("- **dmm_verify.md** — multimeter verification procedure (termination, bias, shorts)")
    refs.append("- **threat_mitigations.md** — threat landscape + OEM + customer mitigations")
    refs.append("")
    refs.append("## Threat landscape")
    refs.append(THREAT["market"])
    refs.append("")
    refs.append("> Full mitigation detail (SecOC, authenticated gateways, key-fob sleep, "
                "customer advice) is in **threat_mitigations.md**.")
    refs.append("")
    refs.append("### Manufacturer mitigations (summary)")
    for mt in THREAT["mitigations"]:
        refs.append("- " + mt)
    refs.append("")
    refs.append("## Per-make community frame databases (start here to extract real IDs)")
    refs.append("- https://github.com/iDoka/awesome-automotive-can-id  (curated index of per-make CAN ID repos)")
    refs.append("- https://github.com/iDoka/awesome-canbus  (CAN reverse-engineering tools)")
    refs.append("- https://opengarages.org  (Raw link references for CAN IDs)")
    refs.append("- https://github.com/commaai/opendbc  (CommaAI decoder ring DB)")
    refs.append("")
    refs.append("## OEM wire-colour + DMM + hardware sources (from Ratchet research)")
    refs.append("- VAG SSP269 CAN Bus Data Transfer: vaglinks.com/Docs/SSP")
    refs.append("- InCartec 'Typical OE CANbus wire colours' chart (incartec blob PDF)")
    refs.append("- dauntlessdevices.com CAN direct-wire installation info")
    refs.append("- Ford MS/HS-CAN pinout: zacharyschneider.ca; yuchormanski.wordpress.com (FORScan)")
    refs.append("- DMM method: gridconnect.com; obd-cable.com; canbusacademy.com; pievcore.com")
    refs.append("- Threat/dark-web: securityweek.com; can-cia.org CAN Injection PDF; nvd CVE-2023-29389")
    refs.append("- Tesla 2023.44 / CVE-2025-6785: plaxidityx.com; hardwear.io SecOC key extraction")
    with open(os.path.join(HERE, "references.md"), "w") as f:
        f.write("\n".join(refs) + "\n")
    print("Wrote references.md")


if __name__ == "__main__":
    main()
