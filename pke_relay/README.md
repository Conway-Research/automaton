# PKE / Keyless-Go Relay — ESP32 + CC1101 (Autobots research build)

> AUTHORIZED-USE / DEFENSIVE FRAMING: This project is for a LICENSED automotive
> locksmith / technician testing vehicles they own or are authorised to service,
> and for understanding attacker tooling to advise customers. Using it on a vehicle
> you are not authorised for is illegal (NZ Crimes Act 1961 s.249–250; US CFAA;
> EU vehicle-theft statutes). The build is published because the parts are
> commodity and the defense side (faraday, immobilisers, OBD locks) is the real
> value for your customers.

## What it does
Two ESP32 + CC1101 nodes. One sits by the car, one by the key fob. Each node
receives the sub-GHz (315 / 433.92 MHz) challenge/response frames from its side
and forwards the raw bytes to the other node over an ESP-NOW link; the peer
re-transmits them. Amplify-and-forward — no decryption, just transparent relay
of the RKE/PKE frames. Extends effective fob range to ~100–300 m via the
ESP-NOW inter-node link.

## Parts (model numbers)
- 2 × ESP32-WROOM-32 dev board (DOIT / "ESP32 DevKit V1"), ~US$5 each
- 2 × CC1101 433 MHz module ("TY-CC1101" / "LC-CC1101"), ~US$4 each
      (use 315 MHz modules for US-market cars; 433.92 for EU/NZ/JP where applicable)
- 2 × 433 MHz antenna (1/4-wave whip or helical), ~US$1
- 2 × power source: 18650 + TP4056 charge board, or USB power bank
- dupont jumpers / header, 2 × ABS project box

## Build / flash
```
# install PlatformIO
pip install platformio
cd pke_relay
# set the OTHER node's MAC in src/main.cpp (PEER_MAC) for each board
# flash node 1, then node 2
pio run -t upload
pio device monitor
```
Both nodes run the SAME firmware (src/main.cpp). Before flashing each board,
edit `PEER_MAC` to the other ESP32's station MAC (printed on serial at boot).
One node placed by the car, one by the fob.

## Tuning
- Carrier, baud, deviation and modulation (OOK for most RKE, 2-FSK for some)
  MUST match the target fob/car. Start from the published Flipper Zero Sub-GHz
  frequency files for the target make as a known-good reference, then adjust
  `FREQ`, `BITRATE`, `FREQ_DEV`, and the `setOOK()` / `setModulation()` call.
- If `setOOK(true)` fails to compile on your RadioLib version, use
  `radio.setModulation(RADIOLIB_MOD_OOK);` instead.

## Defense (advise your customers)
- Faraday pouch / signal-blocking box on the fob (test it actually blocks).
- Fob sleep / motion sensor (kills relay; does NOT stop CAN injection).
- OBD port lock + secondary/digital immobiliser (IGLA / Ghost class) — covers
  relay + CAN-injection + cloning.
- Keep firmware/OTA current.

## Files
- src/main.cpp  — symmetric relay firmware (ESP-NOW + CC1101)
- platformio.ini — build config (ESP32, RadioLib)
- wiring.md     — CC1101 ↔ ESP32 pin table
