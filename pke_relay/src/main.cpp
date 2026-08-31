/*
 * PKE / Keyless-Go relay — symmetric node firmware (Autobots research build)
 *
 * One binary for both nodes. Edit PEER_MAC to the OTHER ESP32's MAC before
 * flashing each board. Place one node by the car, one by the fob.
 *
 * Flow:
 *   CAR  --(sub-GHz RX)--> NODE_A --(ESP-NOW)--> NODE_B --(sub-GHz TX)--> FOB
 *   FOB  --(sub-GHz RX)--> NODE_B --(ESP-NOW)--> NODE_A --(sub-GHz TX)--> CAR
 *
 * No decryption: raw bytes are forwarded transparently.
 *
 * Poll-based RX (no interrupt-API dependency) so it compiles across RadioLib
 * versions. Compile: `pio run -t upload` (set PEER_MAC per board first).
 */

#include <RadioLib.h>
#include <esp_now.h>
#include <WiFi.h>

// ---- CC1101 SPI / interrupt pins (see wiring.md) ----
// Module(cs, gdo0, rst). CC1101 boards usually have no RST -> RADIOLIB_NC.
#define CC_CS   5
#define CC_GDO0 4
#define CC_RST  RADIOLIB_NC

// ---- Tune to the target fob/car ----
#define FREQ       433.92   // 315.0 for US-market RKE
#define BITRATE    4.8      // kbps
#define FREQ_DEV   10.0     // kHz deviation
#define TX_POWER   10.0     // dBm

// ---- Set THIS to the OTHER node's MAC before flashing ----
// Leave broadcast (FF:FF:FF:FF:FF:FF) for a bench smoke test only.
// Tip: flash once with broadcast, read the other node's "my MAC" from serial,
// then set it here and reflash for a locked pair.
uint8_t PEER_MAC[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

Module mod = Module(CC_CS, CC_GDO0, CC_RST);
CC1101 radio = CC1101(&mod);

uint8_t rxBuf[128];

// ESP-NOW: frame from peer -> re-transmit on our local sub-GHz side
void onEspNowRecv(const uint8_t *mac, const uint8_t *data, int len) {
  if (len <= 0 || (size_t)len > sizeof(rxBuf)) return;
  uint8_t txBuf[128];
  memcpy(txBuf, data, len);
  int s = radio.transmit(txBuf, (size_t)len);
  (void)s;
  radio.startReceive();
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("[relay] boot");

  // WiFi station required for ESP-NOW
  WiFi.mode(WIFI_STA);
  Serial.print("[relay] my MAC: ");
  Serial.println(WiFi.macAddress());

  if (esp_now_init() != ESP_OK) {
    Serial.println("[relay] ESP-NOW init failed");
    return;
  }
  esp_now_register_recv_cb(onEspNowRecv);

  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, PEER_MAC, 6);
  peer.channel = 0;
  peer.encrypt = false;
  if (esp_now_add_peer(&peer) != ESP_OK) {
    Serial.println("[relay] peer add failed — set PEER_MAC to the other node");
  }

  // CC1101 init
  int state = radio.begin(FREQ, BITRATE, FREQ_DEV, 125.0 /*rxBw*/, (int8_t)TX_POWER);
  if (state != RADIOLIB_ERR_NONE) {
    Serial.printf("[relay] radio.begin failed: %d\n", state);
    return;
  }
  // Most RKE/PKE is OOK/ASK; some cars use 2-FSK. Match the target.
  // If your RadioLib build rejects setOOK(bool), use:
  //   radio.setModulation(RADIOLIB_MOD_OOK);
  radio.setOOK(true);

  radio.startReceive();
  Serial.println("[relay] ready");
}

void loop() {
  // Poll: did a sub-GHz frame arrive? Forward it to the peer over ESP-NOW.
  if (radio.available()) {
    size_t len = radio.getPacketLength();
    if (len > sizeof(rxBuf)) len = sizeof(rxBuf);
    int s = radio.readData(rxBuf, len);
    if (s == RADIOLIB_ERR_NONE) {
      esp_now_send(PEER_MAC, rxBuf, len);
      Serial.printf("[relay] RX->ESPNOW %u bytes\n", (unsigned)len);
    }
    radio.startReceive();
  }
  delay(1);
}
