# OE CAN Wire Colour Chart

> CRITICAL: wire colours are NOT standardised. They vary by model year and harness. **ALWAYS verify with a multimeter** (resistance ~60Ω between H and L on a terminated bus; idle ~3.5V on CAN-H, ~2.5V on CAN-L; both ~2.5V recessive). Do not assume.


| Manufacturer | CAN-High | CAN-Low |
| --- | --- | --- |
| Alfa Romeo | Pink/black | Pink/white |
| Audi (Infotainment) | Orange/purple | Orange/brown |
| Audi (Comfort) | Orange/green | Orange/brown |
| Bentley (Infotainment) | Orange/purple | Orange/brown |
| Bentley (Comfort) | Orange/green | Orange/brown |
| BMW 1 & 3 series | Green/orange | Green |
| BMW 5 & 6 series | Black | Yellow |
| Chrysler / Dodge / Jeep | White/Orange | White |
| Citroen | Harness cable 9001 | Harness cable 9000 |
| Fiat / Lancia / Iveco | Pink/black | Pink/white |
| Ford | Grey or blue/grey | Blue or purple/grey |
| Mercedes | Brown/red | Brown |
| Peugeot | Harness cable 9001 | Harness cable 9000 |
| Porsche | Yellow | Black |
| Seat (Infotainment/Comfort) | Orange/purple or /green | Orange/brown |
| Skoda (Infotainment/Comfort) | Orange/purple or /green | Orange/brown |
| Vauxhall/Opel | Green | White |
| Volkswagen (Infotainment) | Orange/purple | Orange/brown |
| Volkswagen (Comfort) | Orange/green | Orange/brown |
| Volkswagen (Powertrain) | Orange/black | Orange/brown |
| Volvo | White | Green |
| Subaru BRZ/GR86 (SAS conn.) | Green | Pink |
| Toyota (general) | UNKNOWN — use DMM | UNKNOWN — use DMM |
| Honda/Nissan/Mazda/Hyundai/Kia | UNKNOWN — use DMM | UNKNOWN — use DMM |

## Notes (from OEM / reverse-engineering sources)
- **VAG (VW/Audi/SEAT/Skoda):** consistent 'Orange + tracer' scheme — **brown = CAN-L everywhere**; the tracer on the orange wire tells the domain: black = powertrain, green = comfort, violet = infotainment.
- **Schematic vs harness:** diagnostic literature sometimes draws CAN as yellow(H)/green(L) — that is the VAS 5051 / SSP diagram convention, NOT the physical wire colour. Don't confuse schematic colours with harness colours.
- **Toyota / Honda / Nissan / Kia / Mitsubishi:** no reliable public colour mapping — marked UNKNOWN, verify with DMM every time.
- See **dmm_verify.md** for the confirmation procedure before you cut or tap any wire.
