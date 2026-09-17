"""Render original, code-drawn Folio store artwork (requires Pillow).

Pass --font-dir pointing to the canvas-design skill's canvas-fonts directory.
No screenshots are edited or synthesized by this script.
"""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('--font-dir', type=Path, required=True)
args = parser.parse_args()
out = Path(__file__).resolve().parents[1] / 'store' / 'google-play'
out.mkdir(parents=True, exist_ok=True)
S = 4
INK = '#344e73'
PAPER = '#f4f6fa'

def canvas(w, h, color, mode='RGB'):
    im = Image.new(mode, (w*S, h*S), color)
    return im, ImageDraw.Draw(im)

def box(draw, xy, fill, radius=0, outline=None, width=1):
    xy = tuple(round(n*S) for n in xy)
    draw.rounded_rectangle(xy, radius*S, fill=fill, outline=outline, width=width*S)

def line(draw, xy, color, width=1):
    draw.line([(round(x*S), round(y*S)) for x, y in xy], fill=color, width=width*S, joint='curve')

def text(draw, pos, value, name, size, color):
    font = ImageFont.truetype(str(args.font_dir / name), size*S)
    draw.text((pos[0]*S, pos[1]*S), value, font=font, fill=color, anchor='lt')

def save(im, name, w, h):
    im.resize((w, h), Image.Resampling.LANCZOS).save(out / name, optimize=True)

# The same book geometry as static/icon.svg, with the full square required by Play.
im, d = canvas(512, 512, INK, 'RGBA')
box(d, (145,134,367,378), PAPER, 56)
box(d, (145,134,311,322), PAPER)
box(d, (201,190,367,378), PAPER)
line(d, [(202,134),(202,378)], INK, 13)
for y, end in [(210,319),(252,297)]:
    line(d, [(247,y),(end,y)], INK, 13)
    for x in [247,end]:
        d.ellipse(((x-6.5)*S,(y-6.5)*S,(x+6.5)*S,(y+6.5)*S),fill=INK)
save(im, 'icon-512.png', 512, 512)

# An editorial illustration, not a screenshot or a simulated product screen.
im, d = canvas(1024, 500, '#e9edf4')
box(d, (600, 91, 914, 434), '#cbd5e3', 3)
box(d, (585, 77, 899, 420), '#dbe3ee', 3)
box(d, (570, 63, 884, 406), '#fbfcfe', 3)
line(d, [(598,89),(598,380)], '#d8e0eb', 1)
box(d, (834,63,852,107), '#bd806c')
text(d, (84,106), 'FOLIO', 'WorkSans-Regular.ttf', 19, INK)
text(d, (80,163), 'Your words.', 'CrimsonPro-Regular.ttf', 64, '#263a56')
text(d, (80,230), 'A little room.', 'CrimsonPro-Regular.ttf', 64, '#263a56')
text(d, (84,332), 'Markdown, thoughtfully read.', 'WorkSans-Regular.ttf', 19, '#5c6e88')

text(d, (622,107), '# A clear thought', 'DMMono-Regular.ttf', 17, INK)
for y, length in [(149,216),(163,190),(177,202)]:
    line(d, [(622,y),(622+length,y)], '#c4cedc', 3)

for xy in [(622,216,688,251),(766,216,832,251),(694,281,760,316)]:
    box(d, xy, '#eff3f8', 6, '#8e9fb7', 1)
line(d, [(688,233),(766,233)], INK, 2)
line(d, [(758,228),(766,233),(758,238)], INK, 2)
line(d, [(799,251),(799,298),(760,298)], INK, 2)
line(d, [(768,293),(760,298),(768,303)], INK, 2)
for x,y,length in [(637,233,34),(781,233,36),(709,298,36)]:
    line(d, [(x,y),(x+length,y)], '#8e9fb7', 2)
text(d, (653,346), 'E = mc²', 'CrimsonPro-Italic.ttf', 29, INK)
save(im, 'feature-graphic.png', 1024, 500)
print(out)
