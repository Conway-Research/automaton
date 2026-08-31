# Wiring — CC1101 ↔ ESP32 (SPI)

Both nodes are wired identically.

| CC1101 pin | ESP32 pin | Note |
|------------|-----------|------|
| VCC        | 3.3V      | CC1101 is 3.3V ONLY — do not feed 5V |
| GND        | GND       |      |
| MOSI       | GPIO 23   | SPI MOSI |
| MISO       | GPIO 19   | SPI MISO |
| SCK        | GPIO 18   | SPI CLK |
| CSN        | GPIO 5    | chip select (CS) |
| GDO0       | GPIO 4    | RX/TX interrupt (DIO0) |
| GDO2       | GPIO 2    | optional (DIO2) |

Antenna: connect the 433 MHz (or 315 MHz) antenna to the CC1101 ANT pad.
Do not power the CC1101 from 5V — it will cook the module.

Power both nodes from a 3.3V-capable source (18650+TP4056, or USB bank through
the ESP32's regulator). The ESP32 3.3V rail can supply the CC1101 directly.
