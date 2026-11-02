"""Author-side synthetic fixture builder. Not needed to run the delivered app.

Uses the already bundled Pillow default Aileron font; no downloaded documents,
fonts or customer records. Glyph raster samples are observations, not font files.
"""
import base64
import json
import io
import random
import string
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent


def render(text, size=32, shade=0, background=255):
    font = ImageFont.load_default(size=size)
    cell = size + 5
    lines = text.split('\n')
    image = Image.new('L', (max(map(len, lines)) * cell + 20, len(lines) * (size + 18) + 20), background)
    draw = ImageDraw.Draw(image)
    for y, line in enumerate(lines):
        for x, char in enumerate(line):
            draw.text((10 + x * cell, 10 + y * (size + 18)), char, font=font, fill=shade)
    return image


def bitmap(image):
    box = image.point(lambda v: 255 if v < 128 else 0).getbbox()
    image = image.crop(box)
    width, height = image.size
    return {'width': width, 'height': height, 'pixels': [''.join('1' if image.getpixel((x, y)) < 128 else '0' for x in range(width)) for y in range(height)]}


def main():
    directory = ROOT / 'fixtures'
    directory.mkdir(exist_ok=True)
    glyphs = {char: bitmap(render(char)) for char in string.ascii_uppercase + string.digits}
    (directory / 'glyphs.json').write_text(json.dumps({'schema': 1, 'provenance': 'Synthetic printed Aileron uppercase and digits, Pillow default font; generated locally', 'glyphs': glyphs}), encoding='utf-8')
    training = {
        'invoice': ['INVOICE PAYMENT TOTAL DUE', 'BILL INVOICE CURRENCY AMOUNT', 'INVOICE SERVICES PAYMENT', 'INVOICE TOTAL CHF', 'BILLING INVOICE CHARGE', 'PAYMENT DUE INVOICE TOTAL', 'INVOICE BILL PAYMENT AMOUNT', 'CURRENCY CHF TOTAL INVOICE'],
        'order': ['PURCHASE ORDER QUANTITY GOODS', 'ORDER GOODS TOTAL CURRENCY', 'PURCHASE ORDER ITEMS', 'ORDER QUANTITY STOCK', 'ORDER TOTAL CHF', 'PURCHASE GOODS ORDER', 'ORDER PRODUCT DELIVERY', 'PURCHASE ORDER CURRENCY TOTAL'],
        'support': ['SUPPORT ERROR LOGIN FAILED', 'TECHNICAL SUPPORT NETWORK ERROR', 'SUPPORT PASSWORD RESET', 'SUPPORT APPLICATION CRASH', 'ERROR SUPPORT REQUEST', 'SUPPORT LOGIN ACCESS', 'TECHNICAL PROBLEM SUPPORT', 'SUPPORT ERROR CONNECTION']}
    (directory / 'training.json').write_text(json.dumps(training, indent=2), encoding='utf-8')
    starts = {'invoice': ['INVOICE PAYMENT SERVICES', 'INVOICE BILLING DUE', 'INVOICE AMOUNT CHARGE', 'BILL PAYMENT INVOICE', 'SERVICES INVOICE PAYMENT', 'INVOICE CURRENCY PAYMENT'],
              'order': ['PURCHASE ORDER GOODS', 'ORDER QUANTITY PRODUCT', 'PURCHASE ORDER DELIVERY', 'GOODS ORDER STOCK', 'ORDER ITEMS PURCHASE', 'PURCHASE GOODS ORDER'],
              'support': ['SUPPORT LOGIN ERROR', 'SUPPORT APPLICATION FAILED', 'TECHNICAL SUPPORT RESET', 'SUPPORT PASSWORD PROBLEM', 'NETWORK SUPPORT ERROR', 'SUPPORT CONNECTION CRASH']}
    cases = []
    for label, lines in starts.items():
        for i, line in enumerate(lines):
            document_id = str(1200 + len(cases))
            fields = {'documentId': document_id}
            text = line + '\nID ' + document_id
            if label != 'support':
                fields.update(totalMinor=17001 + i * 137, currency='CHF')
                text += '\nTOTAL ' + str(fields['totalMinor']) + '\nCURRENCY CHF'
            # Distinct from template render: size, contrast, padding and grayscale noise.
            image = render(text, size=[27, 30, 35][i % 3], shade=[0, 35, 55][i % 3], background=[255, 235, 220][i % 3])
            rng = random.Random(300 + len(cases))
            pixels = bytes(max(0, min(255, p + (rng.randrange(-7, 8) if n % 277 == 0 else 0))) for n, p in enumerate(image.get_flattened_data()))
            image = Image.frombytes('L', image.size, pixels)
            buffer = io.BytesIO()
            image.save(buffer, format='PNG')
            raw = buffer.getvalue()
            cases.append({'id': label + '-' + str(i), 'label': label, 'text': text, 'fields': fields, 'image': base64.b64encode(raw).decode()})
    # PGM files are deliberately real raster payloads, not text-as-image metadata.
    (directory / 'holdout.json').write_text(json.dumps(cases), encoding='utf-8')
    print(json.dumps({'glyphs': len(glyphs), 'training': sum(map(len, training.values())), 'holdout': len(cases)}))


if __name__ == '__main__':
    main()
