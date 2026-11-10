"""Genera los iconos PNG de la PWA (manómetro estilizado). Uso: python3 scripts/make_icons.py"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

BG = (15, 76, 92)
FG = (255, 255, 255)
ACC = (255, 183, 77)
OUT = Path(__file__).resolve().parent.parent / "icons"


def draw(size, maskable=False):
    s = size * 4  # supersampling
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, s, s], fill=BG)
        scale = 0.62  # zona segura del 80 %
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG)
        scale = 0.78
    c = s / 2
    r = s * scale / 2
    w = max(4, int(s * 0.055))
    # Arco del manómetro (de 225° a -45°)
    d.arc([c - r, c - r, c + r, c + r], start=135, end=405, fill=FG, width=w)
    # Marcas
    for i in range(7):
        a = math.radians(135 + i * 45)
        r1, r2 = r * 0.72, r * 0.86
        d.line([c + r1 * math.cos(a), c + r1 * math.sin(a), c + r2 * math.cos(a), c + r2 * math.sin(a)],
               fill=FG, width=max(3, w // 2))
    # Aguja
    a = math.radians(135 + 190)
    d.line([c, c, c + r * 0.66 * math.cos(a), c + r * 0.66 * math.sin(a)], fill=ACC, width=w)
    hub = r * 0.12
    d.ellipse([c - hub, c - hub, c + hub, c + hub], fill=ACC)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
draw(192).save(OUT / "icon-192.png")
draw(512).save(OUT / "icon-512.png")
draw(512, maskable=True).save(OUT / "maskable-512.png")
print("Iconos generados en", OUT)
