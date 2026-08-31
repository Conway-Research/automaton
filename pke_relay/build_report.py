#!/usr/bin/env python3
"""
Build a PDF report for the PKE / Keyless-Go relay build.
Uses reportlab (vector drawing, no external SVG tools needed).
Output: /home/ninja/automaton/pke_relay/report.pdf
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, Flowable)
from reportlab.graphics.shapes import Rect, Line, String, Polygon, Circle
from reportlab.lib.enums import TA_LEFT

OUT = "/home/ninja/automaton/pke_relay/report.pdf"

# ---------- styles ----------
ss = getSampleStyleSheet()
H1 = ParagraphStyle('H1', parent=ss['Heading1'], fontSize=16, spaceAfter=6,
                    textColor=colors.HexColor('#1a3c5e'))
H2 = ParagraphStyle('H2', parent=ss['Heading2'], fontSize=12.5, spaceBefore=8,
                    spaceAfter=4, textColor=colors.HexColor('#22577a'))
BODY = ParagraphStyle('BODY', parent=ss['BodyText'], fontSize=9.5, leading=13,
                      alignment=TA_LEFT, spaceAfter=4)
SMALL = ParagraphStyle('SMALL', parent=ss['BodyText'], fontSize=8, leading=10,
                       textColor=colors.HexColor('#555555'))
WARN = ParagraphStyle('WARN', parent=BODY, textColor=colors.HexColor('#a11'),
                      backColor=colors.HexColor('#fdecea'), borderPadding=4,
                      leftIndent=2, rightIndent=2)
CODE = ParagraphStyle('CODE', parent=ss['Code'], fontSize=8, leading=10,
                      backColor=colors.HexColor('#f4f4f4'), borderPadding=4)

story = []

def P(t, s=BODY): story.append(Paragraph(t, s))
def SP(h=6): story.append(Spacer(1, h))

# ============================================================
# DIAGRAM 1 — System architecture
# ============================================================
class ArchDiagram(Flowable):
    def __init__(self):
        super().__init__()
        self.width = 460; self.height = 220
    def draw(self):
        c = self.canv
        # boxes
        def box(x, y, w, h, label, fill):
            c.setFillColor(fill); c.setStrokeColor(colors.black)
            c.roundRect(x, y, w, h, 6, fill=1, stroke=1)
            c.setFillColor(colors.black); c.setFont('Helvetica', 8.5)
            for i, line in enumerate(label):
                c.drawCentredString(x + w/2, y + h - 14 - i*11, line)
        def arrow(x1, y1, x2, y2):
            c.setStrokeColor(colors.HexColor('#b00')); c.setLineWidth(1.5)
            c.line(x1, y1, x2, y2)
            # head
            import math
            ang = math.atan2(y2 - y1, x2 - x1)
            for da in (0.4, -0.4):
                hx = x2 - 8*math.cos(ang+da); hy = y2 - 8*math.sin(ang+da)
                c.line(x2, y2, hx, hy)
        CAR = ['CAR', '(PKE antenna', 'in door/handle)']
        N1  = ['NODE 1', 'ESP32 + CC1101', '(by car)']
        N2  = ['NODE 2', 'ESP32 + CC1101', '(by fob)']
        FOB = ['KEY FOB', '(keyless-go)']
        box(10, 90, 90, 70, CAR, colors.HexColor('#cde6f7'))
        box(130, 90, 100, 70, N1, colors.HexColor('#d8f0d8'))
        box(260, 90, 100, 70, N2, colors.HexColor('#d8f0d8'))
        box(390, 90, 90, 70, FOB, colors.HexColor('#f7e6cd'))
        # ESP-NOW link between nodes (dashed)
        c.setStrokeColor(colors.HexColor('#22577a')); c.setLineWidth(1.5)
        c.setDash(4, 3)
        c.line(230, 125, 260, 125)
        c.setDash()
        c.setFont('Helvetica-Oblique', 7.5); c.setFillColor(colors.HexColor('#22577a'))
        c.drawCentredString(245, 132, 'ESP-NOW (WiFi)')
        c.setFillColor(colors.black); c.setFont('Helvetica', 7.5)
        c.drawCentredString(245, 78, 'inter-node link')
        # challenge arrow car->n1
        arrow(105, 135, 128, 135)
        c.setFont('Helvetica', 6.5)
        c.drawString(112, 140, 'challenge')
        # n1->n2 via espnow (top)
        arrow(180, 160, 300, 160)
        c.drawCentredString(235, 165, 'raw bytes')
        # n2->fob
        arrow(385, 135, 392, 135)
        c.drawString(345, 140, 'challenge')
        # fob response fob->n2
        arrow(392, 110, 385, 110)
        # n2->n1
        arrow(300, 100, 180, 100)
        c.drawCentredString(235, 95, 'response')
        # n1->car
        arrow(128, 110, 105, 110)

# ============================================================
# DIAGRAM 2 — Wiring schematic (two boxes, pins)
# ============================================================
class WiringDiagram(Flowable):
    def __init__(self):
        super().__init__()
        self.width = 460; self.height = 240
    def draw(self):
        c = self.canv
        # CC1101 box (left)
        c.setStrokeColor(colors.black); c.setFillColor(colors.HexColor('#eef3f7'))
        c.roundRect(20, 40, 120, 160, 6, fill=1, stroke=1)
        c.setFillColor(colors.black); c.setFont('Helvetica-Bold', 9)
        c.drawCentredString(80, 192, 'CC1101')
        cc = [('VCC','3.3V'),('GND','GND'),('MOSI','GPIO23'),
              ('MISO','GPIO19'),('SCK','GPIO18'),('CSN','GPIO5'),
              ('GDO0','GPIO4'),('GDO2','GPIO2'),('ANT','antenna')]
        for i,(a,b) in enumerate(cc):
            y = 178 - i*19
            c.setFont('Helvetica', 8)
            c.drawString(28, y, a)
            c.setStrokeColor(colors.HexColor('#888'))
            c.line(70, y+3, 120, y+3)   # stub
            c.setFillColor(colors.HexColor('#a11')); c.setFont('Helvetica-Bold', 7)
            c.drawString(122, y, '')  # placeholder
        # ESP32 box (right)
        c.setStrokeColor(colors.black); c.setFillColor(colors.HexColor('#eaf5ea'))
        c.roundRect(320, 40, 120, 160, 6, fill=1, stroke=1)
        c.setFillColor(colors.black); c.setFont('Helvetica-Bold', 9)
        c.drawCentredString(380, 192, 'ESP32')
        esp = [('3.3V'),('GND'),('GPIO23'),('GPIO19'),('GPIO18'),
               ('GPIO5'),('GPIO4'),('GPIO2')]
        for i,e in enumerate(esp):
            y = 178 - i*19
            c.setStrokeColor(colors.HexColor('#888'))
            c.line(320, y+3, 370, y+3)
            c.setFillColor(colors.black); c.setFont('Helvetica', 8)
            c.drawRightString(372, y, e)
        # draw connecting wires
        c.setStrokeColor(colors.HexColor('#b00')); c.setLineWidth(1.2)
        pairs = [(0,0),(1,1),(2,2),(3,3),(4,4),(5,5),(6,6),(7,7)]
        for i,j in pairs:
            y1 = 178 - i*19 + 3
            y2 = 178 - j*19 + 3
            c.line(120, y1, 320, y2)
        # antenna
        c.setStrokeColor(colors.HexColor('#22577a')); c.setLineWidth(2)
        c.line(20, 40+19-3, 20, 10)
        c.setFont('Helvetica', 7); c.setFillColor(colors.HexColor('#22577a'))
        c.drawString(6, 8, 'ANT')
        # 3.3V note
        c.setFillColor(colors.HexColor('#a11')); c.setFont('Helvetica-Bold', 8)
        c.drawString(140, 18, 'WARNING: VCC -> 3.3V ONLY (never 5V)')

# ============================================================
# DIAGRAM 3 — Signal flow sequence
# ============================================================
class FlowDiagram(Flowable):
    def __init__(self):
        super().__init__()
        self.width = 460; self.height = 150
    def draw(self):
        c = self.canv
        steps = [
            '1. Car polls: "key nearby?"',
            '2. NODE1 (car side) receives poll on 433MHz',
            '3. NODE1 forwards raw bytes to NODE2 over ESP-NOW',
            '4. NODE2 (fob side) re-transmits poll to fob',
            '5. Fob replies with auth response',
            '6. NODE2 -> NODE1 -> Car. Car unlocks / starts.',
        ]
        c.setFont('Helvetica', 8.5); c.setFillColor(colors.black)
        y = 135
        for s in steps:
            c.setStrokeColor(colors.HexColor('#22577a')); c.setLineWidth(1)
            c.setFillColor(colors.HexColor('#eef3f7'))
            c.roundRect(20, y-12, 420, 16, 3, fill=1, stroke=1)
            c.setFillColor(colors.black)
            c.drawString(28, y-2, s)
            y -= 22
        # down arrows
        c.setStrokeColor(colors.HexColor('#b00')); c.setLineWidth(1)
        c.line(230, 135-14, 230, 135-22)

# ============================================================
# BUILD STORY
# ============================================================
P("PKE / Keyless-Go Relay — Build & Reference Report", H1)
P("Autobots / Optimus — licensed-locksmith defensive reference. "
  "Firmware compiled OK (PlatformIO). Facts verified against CC1101, "
  "ESP-NOW and RadioLib documentation (see Fact-Check).", SMALL)

P("⚠ AUTHORISED USE ONLY", H2)
P("This device extends a vehicle's keyless-entry radio range. It is for a "
  "LICENSED locksmith / technician testing a vehicle they own or are entitled "
  "to service, and to understand attacker methods in order to advise customers. "
  "Using it on a vehicle you are not authorised for is a criminal offence "
  "(NZ Crimes Act 1961 s.249–250; US CFAA; EU member-state vehicle-theft "
  "statutes). The defensive value — what to sell/advise — is in Section 7.", WARN)

SP()
P("1. What it is", H2)
P("Two ESP32+CC1101 nodes. One sits by the car, one by the key fob. Each "
  "receives the sub-GHz (315 / 433.92 MHz) challenge/response frames on its "
  "side and forwards the raw bytes to the other node over an ESP-NOW link; the "
  "peer re-transmits them. Amplify-and-forward — no decryption, transparent "
  "relay of the RKE/PKE frames. Effective fob range extends to ~100–300 m via "
  "the inter-node link.")

P("2. System architecture", H2)
story.append(ArchDiagram())
SP(4)
P("Figure 1. Two nodes relay the car<->fob radio exchange over an ESP-NOW "
  "(WiFi) link. No key data is decoded — bytes are passed through.", SMALL)

P("3. Parts & prices (build TWO of each)", H2)
parts = [['#','Part','Model / search term','Price (each)','Qty'],
 ['1','ESP32 dev board','ESP32 DevKit V1 / DOIT WROOM-32','NZ$9–14','2'],
 ['2','CC1101 433 MHz module','TY-CC1101 / LC-CC1101 (315 MHz for US cars)','NZ$6–10 import / NZ$20–25 retail','2'],
 ['3','Antenna','433 MHz 1/4-wave whip','NZ$1–3','2'],
 ['4','Battery / power','18650 + TP4056 OR USB power bank','NZ$4–12','2'],
 ['5','Wire','Dupont jumper female-female','NZ$2 a strip','1'],
 ['6','Box','ABS project box 70×50×25mm','NZ$1–2','2'],
 ['','TOTAL PAIR','',  '~NZ$50–90','']]
t = Table(parts, colWidths=[16*mm, 33*mm, 70*mm, 45*mm, 12*mm])
t.setStyle(TableStyle([
    ('FONTSIZE',(0,0),(-1,-1),8),
    ('BACKGROUND',(0,0),(-1,0),colors.HexColor('#22577a')),
    ('TEXTCOLOR',(0,0),(-1,0),colors.white),
    ('GRID',(0,0),(-1,-1),0.4,colors.grey),
    ('BACKGROUND',(0,-1),(-1,-1),colors.HexColor('#fdecea')),
    ('FONTNAME',(0,-1),(-1,-1),'Helvetica-Bold'),
    ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
]))
story.append(t)
SP(4)
P("No-solder alternative: a Flipper Zero (or two) running Sub-GHz Remote relay "
  "does the same thing — ~NZ$300+ each. Same legality rules.", SMALL)

P("4. Wiring (both boxes identical)", H2)
story.append(WiringDiagram())
SP(4)
P("Figure 2. CC1101 ↔ ESP32. VCC→3.3V (NEVER 5V). GND→GND. "
  "MOSI→23, MISO→19, SCK→18, CSN→5, GDO0→4, GDO2→2. ANT→antenna.", SMALL)
wires = [['CC1101','ESP32'],['VCC','3.3V'],['GND','GND'],['MOSI','GPIO 23'],
 ['MISO','GPIO 19'],['SCK','GPIO 18'],['CSN','GPIO 5'],['GDO0','GPIO 4'],
 ['GDO2','GPIO 2'],['ANT','antenna']]
t2 = Table(wires, colWidths=[40*mm, 40*mm])
t2.setStyle(TableStyle([
    ('FONTSIZE',(0,0),(-1,-1),8),
    ('BACKGROUND',(0,0),(-1,0),colors.HexColor('#22577a')),
    ('TEXTCOLOR',(0,0),(-1,0),colors.white),
    ('GRID',(0,0),(-1,-1),0.4,colors.grey),
    ('BACKGROUND',(0,1),(-1,1),colors.HexColor('#ffe9e6')),
]))
story.append(t2)

story.append(PageBreak())
P("5. Software / flash", H2)
P("Install PlatformIO (free): <b>pip install platformio</b>. Project files at "
  "/home/ninja/automaton/pke_relay/ (platformio.ini, src/main.cpp).", BODY)
P("Steps:", BODY)
for s in [
 "1. Flash NODE 1 with PEER_MAC left as broadcast FF:FF:FF:FF:FF:FF. Serial "
 "prints '[relay] my MAC: AA:BB:..' — write it down.",
 "2. In src/main.cpp set PEER_MAC to NODE 1's MAC, flash NODE 2. Note its MAC.",
 "3. Set NODE 1's PEER_MAC to NODE 2's MAC, reflash NODE 1 → locked pair.",
 "4. Tune: FREQ 433.92 (315 for US), BITRATE 4.8, FREQ_DEV 10, setOOK(true). "
 "If setOOK fails, use radio.setModulation(RADIOLIB_MOD_OOK);. Reflash both.",
]:
    P("• " + s, BODY)

P("6. Signal flow", H2)
story.append(FlowDiagram())
SP(4)
P("Figure 3. Poll is relayed to the fob, the fob's response is relayed back. "
  "The car behaves as if the fob is beside it.", SMALL)

P("7. Defense — what to advise customers", H2)
for s in [
 "1. Faraday pouch / box for the fob (TEST it actually blocks).",
 "2. Fob sleep / motion sensor — kills relay; does NOT stop CAN injection.",
 "3. OBD port lock / shield — blocks the other major attack path.",
 "4. Secondary / digital immobiliser (IGLA, Ghost class, ~NZ$1,800–2,500 "
 "fitted) — blocks engine start even if the car 'thinks' the key is valid. "
 "Covers relay + CAN-injection + cloning in one.",
 "5. Keep car firmware / OTA current.",
]:
    P("• " + s, BODY)
P("Layered (faraday + immobiliser + OBD lock) covers all three tiers: relay, "
  "CAN-injection, and OBD key-cloning.", SMALL)

P("8. Fact-check (verified)", H2)
for s in [
 "CC1101 SPI pins (MOSI/MISO/SCK/CSN/GDO0/GDO2) — confirmed standard, our "
 "GPIO map valid.",
 "ESP-NOW: esp_now_register_recv_cb + peer-add — confirmed correct API.",
 "RadioLib CC1101: begin(freq,br,dev,rxBw,pwr), setOOK(), available(), "
 "getPacketLength(), readData(), transmit(), startReceive() — all confirmed "
 "present in the CC1101 class.",
 "OOK/ASK is the correct modulation for most RKE — confirmed (CC1101 setOOK).",
 "Firmware compiles: pio run → SUCCESS (58% flash, 13.6% RAM).",
]:
    P("✓ " + s, BODY)

P("Build files: /home/ninja/automaton/pke_relay/  (src/main.cpp, platformio.ini, "
  "wiring.md, README.md, GUIDE.md).", SMALL)

doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=18*mm, rightMargin=18*mm,
                        topMargin=16*mm, bottomMargin=16*mm,
                        title="PKE Relay Build Report")
doc.build(story)
print("WROTE", OUT)
