# CAN Sniffing / Injection Hardware


| Device | Price | Interface | Pros | Cons | Use |
| --- | --- | --- | --- | --- | --- |
| CANable 2.0 Pro | ~US$40-60 | USB-C, SocketCAN (candleLight firmware), Linux native | Isolated, CAN-FD support, plug-and-play on Linux, python-can + can-utils. | Needs Linux host (or WSL); known reset hardware quirk on MKS variant. | Primary sniff + inject tool on this rig. |
| CANable (non-Pro) | ~US$25-35 | USB, SocketCAN (slcan/candleLight) | Cheap, small. | No isolation; same reset quirk. | Bench / low-risk taps. |
| CANPico + CANHack (Canis Labs / Ken Tindell) | ~US$30 + Pico | Raspberry Pi Pico carrier, MicroPython SDK | CAN fault/error injection (CANHack), µs timestamps, scope/LA headers, listen-only jumper. | MicroPython dev; not a plug-and-play dongle. | Research / fault-injection, protocol-level security testing. |
| Raspberry Pi Pico + MCP2515/SN65HVD23x | ~US$10-20 | SPI CAN controller + transceiver | DIY, cheap, flexible. | Wiring + code required. | Custom emulators / logging. |
| ESP32 + CAN transceiver (TWAI) | ~US$8-15 | ESP32 TWAI peripheral + transceiver | WiFi/BLE link for remote relay; cheap. | 3.3V logic; level concerns. | Wireless relay / field logging. |
| Macchina M2 | ~US$99 (dev kit) | Arduino Due core; 2x CAN, SWCAN, LIN, J1850; OBD-II dongle or under-hood | Multi-protocol, SavvyCAN support, SD logging, XBee wireless socket. | Larger; software still maturing. | All-in-one automotive hacking platform. |
| Tactrix OpenPort 2.0 | ~US$170 | J2534 pass-through (USB) | Reflash/diagnostic focus, Subaru/Toyota strong. | J2534 (not raw SocketCAN); Windows-centric. | Reflash + OEM diag, not generic injection. |
| Commercial 'emergency start' theft devices | up to €5000 on dark web | Hidden in consumer items (e.g. JBL speaker); PIC + CAN transceiver | N/A (attacker tooling). | ILLEGAL to use/own for theft; understand only to advise customers / defence. | DEFENSIVE AWARENESS ONLY — know what customers are exposed to. |
| Software: SavvyCAN, can-utils (candump/cansend), Wireshark, python-can | Free | Host tools | Capture, filter, replay, DBC decode. | Learning curve. | Analysis + replay of captured frames. |
