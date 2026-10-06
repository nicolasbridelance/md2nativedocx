#!/usr/bin/env python3
"""Regenerate docs/showcase/smartart.png: Mermaid source (left) -> native Word SmartArt (right).

Each sample below is exported through the real CLI with SmartArt on (MD2NATIVEDOCX_ENABLE_SMARTART=1) and the
cached drawing on (MD2NATIVEDOCX_SMARTART_DRAWING=1, what LibreOffice paints), then rendered with headless
LibreOffice (same pinned fontconfig as scripts/test-visual.mjs). A bottom strip shows one process in several
of the looks offered by `md2nativedocx.smartArt.style`.
    python3 scripts/build-smartart-showcase.py [out_dir]
Requires: node, pandoc, soffice, pdftoppm, Pillow.
"""
import os, subprocess, sys, tempfile, shutil
from PIL import Image, ImageChops, ImageDraw, ImageFont

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cli = os.path.join(root, 'packages/cli/bin/md2nativedocx.mjs')
base_env = {**os.environ, 'FONTCONFIG_FILE': os.path.join(root, 'test-corpus/visual/fontconfig/fonts.conf'),
            'MD2NATIVEDOCX_ENABLE_SMARTART': '1', 'MD2NATIVEDOCX_SMARTART_DRAWING': '1'}

# (title, what Word makes of it, Mermaid source, look)
SAMPLES = [
 ('Process', 'a chain becomes a SmartArt process, shapes kept', 'flowchart LR\n  A([Idea]) --> B[Draft]\n  B --> C{Review}\n  C --> D[(Archive)]', 'colorful'),
 ('Cycle', 'a loop becomes a SmartArt cycle', 'flowchart LR\n  P[Plan] --> D[Do]\n  D --> C[Check]\n  C --> A[Act]\n  A --> P', 'colorful'),
 ('Org chart', 'a tree becomes a SmartArt hierarchy', 'flowchart TD\n  CEO --> CTO\n  CEO --> CFO\n  CTO --> Dev[Engineering]\n  CTO --> Ops[Operations]\n  CFO --> Acc[Accounting]', 'colorful'),
 ('Mindmap', 'a mindmap becomes a SmartArt hierarchy', 'mindmap\n  root((Launch))\n    Product\n      Pricing\n      Docs\n    Marketing\n      Blog\n      Webinar', 'colorful'),
 ('Timeline', 'a timeline becomes a SmartArt time line', 'timeline\n  2021 : Prototype\n  2022 : First customer\n  2023 : Series A\n  2024 : Europe', 'colorful'),
 ('Kanban', 'a board becomes a SmartArt grouped list', 'kanban\n  Todo\n    t1[Write spec]\n    t2[Pick fonts]\n  Doing\n    t3[Build export]\n  Done\n    t4[Kick-off]', 'colorful'),
]
LOOK_SRC = 'flowchart LR\n  A[Plan] --> B[Build]\n  B --> C[Test]\n  C --> D[Ship]'
LOOKS = ['simple', 'moderate', 'colorful', 'intense']

work = tempfile.mkdtemp()
def crop(im, pad=12):
    b = ImageChops.difference(im, Image.new('RGB', im.size, (255, 255, 255))).getbbox()
    return im.crop((max(b[0]-pad, 0), max(b[1]-pad, 0), b[2]+pad, b[3]+pad)) if b else im

def render(name, src, style):
    md = os.path.join(work, name + '.md'); open(md, 'w').write('```mermaid\n' + src + '\n```\n')
    docx = os.path.join(work, name + '.docx')
    env = {**base_env, 'MD2NATIVEDOCX_SMARTART_STYLE': style}
    subprocess.run(['node', cli, md, '-o', docx], check=True, capture_output=True, env=env)
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', work, docx],
                   check=True, capture_output=True, env=env)
    subprocess.run(['pdftoppm', '-r', '110', '-png', '-singlefile', os.path.join(work, name + '.pdf'),
                    os.path.join(work, name)], check=True)
    return crop(Image.open(os.path.join(work, name + '.png')).convert('RGB'))

def font(sz, bold=False, mono=False):
    p = '/usr/share/fonts/truetype/dejavu/DejaVuSans%s%s.ttf' % ('Mono' if mono else '', '-Bold' if bold else '')
    return ImageFont.truetype(p, sz) if os.path.exists(p) else ImageFont.load_default()

tiles = [(t, sub, src, render('s%d' % i, src, look)) for i, (t, sub, src, look) in enumerate(SAMPLES)]
looks = [(lk, render('look-' + lk, LOOK_SRC, lk)) for lk in LOOKS]
for t in tiles: print('ok', t[0])

PAD, HEAD, SW, PW, PH = 16, 40, 250, 520, 300   # source panel width, picture panel width/height
TW = SW + PW + 3 * 8
W = 2 * TW + 3 * PAD
LH = 150                                        # looks strip panel height
ROWS = (len(SAMPLES) + 1) // 2
H = 100 + ROWS * (HEAD + PH + 8 + PAD) + 40 + LH + 40 + 36
canvas = Image.new('RGB', (W, H), '#F6F5FA'); d = ImageDraw.Draw(canvas)
d.text((PAD, 16), 'md2nativedocx — Mermaid to native Word SmartArt', font=font(24, True), fill='#2B2140')
d.text((PAD, 52), 'Chains, cycles, trees, mindmaps, timelines and kanban boards export as real SmartArt graphics: add a step or a branch from',
       font=font(13), fill='#555')
d.text((PAD, 72), "Word's Text Pane, switch layout or restyle from the SmartArt Design tab. Rendered here with LibreOffice; same result in Word.",
       font=font(13), fill='#555')

def paste_fit(im, x, y, w, h):
    t = im.copy(); t.thumbnail((w - 16, h - 16)); canvas.paste(t, (x + (w - t.width) // 2, y + (h - t.height) // 2))

for i, (title, sub, src, im) in enumerate(tiles):
    x = PAD + (i % 2) * (TW + PAD); y = 100 + (i // 2) * (HEAD + PH + 8 + PAD)
    d.rounded_rectangle([x, y, x + TW, y + HEAD + PH + 8], 8, fill='#EFEDF8', outline='#DDD8EA')
    d.text((x + 10, y + 9), title, font=font(16, True), fill='#2B2140')
    d.text((x + 20 + d.textlength(title, font=font(16, True)), y + 12), sub, font=font(12), fill='#6B6680')
    sx, sy = x + 8, y + HEAD
    d.rounded_rectangle([sx, sy, sx + SW, sy + PH], 6, fill='#2B2140')
    d.text((sx + 10, sy + 8), 'Mermaid source', font=font(11, True), fill='#B9B2D3')
    d.multiline_text((sx + 10, sy + 30), src, font=font(12, mono=True), fill='#F2EEFF', spacing=5)
    ax = sx + SW + 4
    d.text((ax - 1, sy + PH // 2 - 9), '→', font=font(14, True), fill='#7C3AED')
    px = sx + SW + 16
    d.rounded_rectangle([px, sy, px + PW - 8, sy + PH], 6, fill='white', outline='#E4E0EF')
    d.text((px + 10, sy + 8), 'Word SmartArt', font=font(11, True), fill='#7C3AED')
    paste_fit(im, px, sy + 20, PW - 8, PH - 20)

ly = 100 + ROWS * (HEAD + PH + 8 + PAD) + 4
d.text((PAD, ly), 'Same process, four of the seven looks (md2nativedocx.smartArt.style) — all follow the document theme’s colours',
       font=font(16, True), fill='#2B2140')
lw = (W - PAD * (len(looks) + 1)) // len(looks)
for i, (lk, im) in enumerate(looks):
    x = PAD + i * (lw + PAD); y = ly + 32
    d.rounded_rectangle([x, y, x + lw, y + LH], 6, fill='white', outline='#E4E0EF')
    d.text((x + 10, y + 8), lk, font=font(12, True), fill='#7C3AED')
    paste_fit(im, x, y + 18, lw, LH - 18)
d.text((PAD, H - 30), 'Regenerate with scripts/build-smartart-showcase.py. SmartArt is on by default in the VS Code extension; on the CLI, set MD2NATIVEDOCX_ENABLE_SMARTART=1.',
       font=font(12), fill='#777')

out = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(root, 'docs/showcase'))
os.makedirs(out, exist_ok=True)
canvas.quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(os.path.join(out, 'smartart.png'), optimize=True)  # 256 colours: about 3x smaller, no visible change on these flat renders; print('wrote smartart.png', canvas.size)
shutil.rmtree(work)
