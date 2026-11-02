"""Bounded template OCR for high-contrast, upright printed synthetic forms.

No hidden text layers, document IDs, expected answers or network services are read.
Unknown/ambiguous glyphs are explicitly rejected. This is not arbitrary-font OCR.
"""
import json
import math
import re
import struct
import statistics
import zlib
from pathlib import Path

MAX_PIXELS = 1200000


def parse_png(raw):
    """Strict 8-bit grayscale noninterlaced PNG, including all five row filters."""
    if len(raw) > MAX_PIXELS or not raw.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('bounded grayscale PNG required')
    offset, compressed, width, height, ended = 8, bytearray(), None, None, False
    while offset < len(raw):
        if offset+12 > len(raw):
            raise ValueError('truncated PNG')
        length = struct.unpack('>I', raw[offset:offset+4])[0]
        kind = raw[offset+4:offset+8]
        data = raw[offset+8:offset+8+length]
        if len(data) != length or offset+12+length > len(raw):
            raise ValueError('invalid PNG chunk')
        crc = struct.unpack('>I', raw[offset+8+length:offset+12+length])[0]
        if zlib.crc32(kind+data) & 0xffffffff != crc:
            raise ValueError('PNG checksum mismatch')
        if kind == b'IHDR':
            if width is not None or offset != 8 or length != 13:
                raise ValueError('PNG header order')
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', data)
            if not (8 <= width <= 1600 and 8 <= height <= 1600 and width*height <= MAX_PIXELS) or (depth, color, compression, filtering, interlace) != (8, 0, 0, 0, 0):
                raise ValueError('only bounded 8-bit grayscale PNG supported')
        elif kind == b'IDAT':
            if width is None:
                raise ValueError('PNG header missing')
            compressed.extend(data)
        elif kind == b'IEND':
            if length != 0 or offset+12 != len(raw):
                raise ValueError('PNG trailing bytes')
            ended = True
        elif kind[:1].isupper():
            raise ValueError('unsupported critical PNG chunk')
        offset += length+12
    if not ended or width is None:
        raise ValueError('incomplete PNG')
    expected = (width+1)*height
    decoder = zlib.decompressobj()
    try:
        decoded = decoder.decompress(bytes(compressed), expected+1)
    except zlib.error as error:
        raise ValueError('invalid PNG compression stream') from error
    if len(decoded) != expected or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
        raise ValueError('PNG decompression bounds')
    out, previous = bytearray(), [0]*width
    for y in range(height):
        mode = decoded[y*(width+1)]
        if mode > 4:
            raise ValueError('invalid PNG filter')
        current = list(decoded[y*(width+1)+1:(y+1)*(width+1)])
        for x in range(width):
            left = current[x-1] if x else 0
            up, corner = previous[x], previous[x-1] if x else 0
            delta = 0
            if mode == 1: delta = left
            if mode == 2: delta = up
            if mode == 3: delta = (left+up)//2
            if mode == 4:
                p = left+up-corner
                delta = min([(abs(p-left), 0, left), (abs(p-up), 1, up), (abs(p-corner), 2, corner)])[2]
            current[x] = (current[x]+delta) & 255
        out.extend(current)
        previous = current
    return width, height, bytes(out)


def parse_pgm(raw):
    if not isinstance(raw, bytes) or len(raw) > MAX_PIXELS + 100:
        raise ValueError('bounded PGM raster required')
    header = re.match(rb'P5\s+([0-9]{1,5})\s+([0-9]{1,5})\s+255[\r]?\n', raw)
    if not header:
        raise ValueError('P5 8-bit PGM required')
    width, height = map(int, header.groups())
    if not (8 <= width <= 1600 and 8 <= height <= 1600 and width * height <= MAX_PIXELS):
        raise ValueError('raster dimensions outside contract')
    pixels = raw[header.end():]
    if len(pixels) != width * height:
        raise ValueError('raster byte count mismatch')
    return width, height, pixels


def normalize(rows, width=16, height=24):
    h, w = len(rows), len(rows[0])
    return tuple(rows[min(h-1, int((y + .5) * h / height))][min(w-1, int((x + .5) * w / width))] for y in range(height) for x in range(width))


def spans(values):
    start = None
    for i, value in enumerate(list(values) + [False]):
        if value and start is None:
            start = i
        elif not value and start is not None:
            yield start, i
            start = None


def recognize(raw):
    width, height, pixels = parse_png(raw) if raw.startswith(b'\x89PNG') else parse_pgm(raw)
    low, high = min(pixels), max(pixels)
    if high - low < 45:
        return {'text': '', 'accepted': False, 'confidence': 0.0, 'reason': 'low-contrast-or-blank'}
    threshold = (high + low) / 2
    rows = [tuple(v < threshold for v in pixels[y*width:(y+1)*width]) for y in range(height)]
    glyphs = json.loads((Path(__file__).parent / 'fixtures/glyphs.json').read_text(encoding='utf-8'))['glyphs']
    templates = [(char, normalize([[v == '1' for v in row] for row in g['pixels']]), g['width']/g['height']) for char, g in glyphs.items()]
    lines, scores, accepted = [], [], True
    for y0, y1 in spans(any(row) for row in rows):
        if y1-y0 < 5:
            accepted = False
            continue
        regions = list(spans(any(rows[y][x] for y in range(y0, y1)) for x in range(width)))
        if len(regions) > 120:
            raise ValueError('too many glyphs')
        # The supported form uses fixed character cells. Ink gaps alone would
        # incorrectly split narrow I/1 glyphs from their neighboring characters.
        pitches = [regions[i+1][0]-regions[i][0] for i in range(len(regions)-1)]
        pitch = statistics.median(pitches) if pitches else y1-y0
        text, previous = '', None
        for x0, x1 in regions:
            crop = [row[x0:x1] for row in rows[y0:y1]]
            yy = [i for i, row in enumerate(crop) if any(row)]
            crop = crop[yy[0]:yy[-1]+1]
            if len(crop) < 4 or x1-x0 < 1:
                accepted = False
                continue
            observed = normalize(crop)
            ratio = (x1-x0)/len(crop)
            ranked = sorted((sum(a != b for a, b in zip(observed, bits))/len(bits) + min(.5, abs(math.log(ratio/aspect))) * .15, char) for char, bits, aspect in templates)
            distance, char = ranked[0]
            if distance > .23 or ranked[1][0] - distance < .007:
                char, accepted = '?', False
            if previous is not None and x0-previous > pitch*1.6:
                text += ' '
            text += char
            previous = x0
            scores.append(max(0.0, 1-distance))
        lines.append(text)
    text = '\n'.join(lines)
    return {'text': text, 'accepted': accepted and bool(text) and bool(scores), 'confidence': round(min(scores, default=0), 5), 'reason': None if accepted and text else 'unsupported-or-ambiguous-glyph'}
