#!/usr/bin/env python3
"""Regenerate docs/showcase/preview.png: one real export per supported Mermaid type.

Each fixture in test-corpus/visual/fixtures is exported through the real CLI, rendered with
headless LibreOffice (same pinned fontconfig as scripts/test-visual.mjs), auto-cropped, and tiled
into a grid. Requires: node, pandoc, soffice, Pillow. Usage: python3 scripts/build-showcase.py [outdir]
"""
import os, subprocess, sys, tempfile
from PIL import Image, ImageChops, ImageDraw, ImageFont

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fx = os.path.join(root, 'test-corpus/visual/fixtures')
cli = os.path.join(root, 'packages/cli/bin/md2nativedocx.mjs')
env = {**os.environ, 'FONTCONFIG_FILE': os.path.join(root, 'test-corpus/visual/fontconfig/fonts.conf')}
# (label, fixture) — one per Mermaid type, in a pleasing order
TYPES = [('flowchart','colors'),('sequence','sequence'),('class','class-diagram'),('state','state-diagram'),
 ('er','er-diagram'),('gantt','gantt'),('pie','pie'),('mindmap','mindmap'),('timeline','timeline'),
 ('journey','journey'),('gitGraph','git-graph'),('quadrant','quadrant'),('requirement','requirement-diagram'),
 ('C4','c4'),('sankey','sankey'),('xychart','xychart'),('block','block'),('packet','packet'),
 ('kanban','kanban'),('architecture','architecture-diagram'),('radar','radar'),('treemap','treemap'),
 ('venn','venn'),('ishikawa','ishikawa'),('wardley','wardley'),('cynefin','cynefin'),
 ('treeView','tree-view'),('eventmodeling','eventmodeling'),('zenuml','zenuml')]
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'docs/showcase')
os.makedirs(out, exist_ok=True)
work = tempfile.mkdtemp()
tiles = []
for label, name in TYPES:
    mmd = open(os.path.join(fx, name + '.mmd')).read()
    md = os.path.join(work, name + '.md'); open(md, 'w').write('```mermaid\n' + mmd + '\n```\n')
    docx = os.path.join(work, name + '.docx')
    subprocess.run(['node', cli, md, '-o', docx], check=True, capture_output=True)
    subprocess.run(['soffice', '--headless', '--convert-to', 'png', '--outdir', work, docx],
                   check=True, capture_output=True, env=env)
    im = Image.open(os.path.join(work, name + '.png')).convert('RGB')
    bbox = ImageChops.difference(im, Image.new('RGB', im.size, (255, 255, 255))).getbbox()
    if bbox: im = im.crop((max(bbox[0]-12,0), max(bbox[1]-12,0), bbox[2]+12, bbox[3]+12))
    im.save(os.path.join(out, 'tile-' + name + '.png')) if '--keep' in sys.argv else None
    tiles.append((label, im)); print('ok', label, im.size)

COLS, CW, CH, PAD, HEAD = 5, 400, 300, 14, 36
rows = -(-len(tiles) // COLS)
W = COLS * (CW + PAD) + PAD; H = 90 + rows * (CH + HEAD + PAD) + 40
canvas = Image.new('RGB', (W, H), '#F6F5FA'); d = ImageDraw.Draw(canvas)
def font(sz, bold=False):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf' % ('-Bold' if bold else '')]:
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()
d.text((PAD, 18), 'md2nativedocx — all 29 Mermaid diagram types, exported to native, editable Word shapes', font=font(24, True), fill='#2B2140')
d.text((PAD, 52), 'Every tile is a real .docx export rendered with LibreOffice — not a screenshot of Mermaid, not a PNG embedded in Word.', font=font(14), fill='#555')
for i, (label, im) in enumerate(tiles):
    x = PAD + (i % COLS) * (CW + PAD); y = 90 + (i // COLS) * (CH + HEAD + PAD)
    d.rounded_rectangle([x, y, x + CW, y + CH + HEAD], 8, fill='white', outline='#DDD8EA')
    d.text((x + 10, y + 8), label, font=font(16, True), fill='#2B2140')
    t = im.copy(); t.thumbnail((CW - 16, CH - 8)); canvas.paste(t, (x + (CW - t.width) // 2, y + HEAD + (CH - t.height) // 2))
d.text((PAD, H - 28), 'Mermaid is MIT-licensed (c) Knut Sveidqvist and contributors — https://mermaid.js.org', font=font(12), fill='#777')
canvas.save(os.path.join(out, 'preview.png'), optimize=True); print('wrote preview.png', canvas.size)
