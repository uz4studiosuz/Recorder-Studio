"""Renders the app icon (same design as build/icon.svg) to PNG and ICO with Pillow.

Run: python scripts/make-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
S = 4  # supersampling factor
N = 1024 * S


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient():
    stops = [(0, (0x6D, 0x5C, 0xF0)), (0.55, (0xB8, 0x6A, 0xD6)), (1, (0xFF, 0x9A, 0x6B))]
    small = Image.new('RGB', (256, 256))
    px = small.load()
    for y in range(256):
        for x in range(256):
            t = (x + y) / 510
            for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
                if t <= t1:
                    px[x, y] = lerp(c0, c1, (t - t0) / (t1 - t0))
                    break
    return small.resize((N, N), Image.BICUBIC)


def render():
    s = lambda v: round(v * S)
    icon = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    mask = Image.new('L', (N, N), 0)
    ImageDraw.Draw(mask).rounded_rectangle((s(64), s(64), s(960), s(960)), radius=s(208), fill=255)
    background = gradient().convert('RGBA')
    gloss = Image.new('L', (1, N))
    for y in range(N):
        t = (y / S - 64) / 448
        gloss.putpixel((0, y), max(0, round(34 * (1 - t) ** 2)) if 0 <= t <= 1 else 0)
    white = Image.new('RGBA', (N, N), (255, 255, 255, 255))
    background = Image.composite(white, background, gloss.resize((N, N)))
    icon.paste(background, (0, 0), mask)
    d = ImageDraw.Draw(icon)
    cx = cy = s(492)
    d.ellipse((cx - s(268), cy - s(268), cx + s(268), cy + s(268)), fill='white')
    inner = Image.new('L', (N, N), 0)
    ImageDraw.Draw(inner).ellipse((cx - s(204), cy - s(204), cx + s(204), cy + s(204)), fill=255)
    icon.paste(background, (0, 0), inner)
    d.ellipse((cx - s(104), cy - s(104), cx + s(104), cy + s(104)), fill='white')
    # Cursor: soft shadow, then a white arrow, tip resting on the ring.
    arrow = [(0, 0), (0, 262), (62, 202), (110, 300), (162, 276), (114, 180), (200, 180)]
    ox, oy = 640, 640
    points = [(s(x + ox), s(y + oy)) for x, y in arrow]
    shadow = Image.new('L', (N, N), 0)
    ImageDraw.Draw(shadow).polygon([(x, y + s(14)) for x, y in points], fill=150)
    shadow = shadow.filter(ImageFilter.GaussianBlur(s(18)))
    icon.paste(Image.new('RGBA', (N, N), (0x2A, 0x14, 0x48, 255)), (0, 0), Image.composite(shadow, Image.new('L', (N, N), 0), mask))
    d = ImageDraw.Draw(icon)
    d.polygon(points, fill='white')
    return icon.resize((1024, 1024), Image.LANCZOS)


icon = render()
(ROOT / 'build').mkdir(exist_ok=True)
icon.save(ROOT / 'build' / 'icon.png')
icon.save(ROOT / 'build' / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
icon.resize((512, 512), Image.LANCZOS).save(ROOT / 'public' / 'icon.png')
icon.resize((180, 180), Image.LANCZOS).save(ROOT / 'website' / 'assets' / 'apple-touch-icon.png')
print('icons written')
