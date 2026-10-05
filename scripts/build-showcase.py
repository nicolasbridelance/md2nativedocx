#!/usr/bin/env python3
"""Regenerate docs/showcase/preview.png: Mermaid.js (left) vs md2nativedocx (right), per supported type.

Right panel: each fixture in test-corpus/visual/fixtures is exported through the real CLI and rendered
with headless LibreOffice (same pinned fontconfig as scripts/test-visual.mjs). Left panel: the same
source rendered by the real Mermaid.js in headless Chrome. Mermaid is NOT a repo dependency: install it
anywhere you like and point MERMAID_DIR at it, e.g.
    mkdir /tmp/mm && cd /tmp/mm && npm i mermaid @mermaid-js/mermaid-zenuml
    MERMAID_DIR=/tmp/mm CHROME=/path/to/chrome-headless-shell python3 scripts/build-showcase.py
Requires: node, pandoc, soffice, Pillow. Without MERMAID_DIR, only the right panels are drawn.
"""
import os, subprocess, sys, tempfile, shutil, time, http.server, threading, functools, json
from PIL import Image, ImageChops, ImageDraw, ImageFont

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fx = os.path.join(root, 'test-corpus/visual/fixtures')
cli = os.path.join(root, 'packages/cli/bin/md2nativedocx.mjs')
env = {**os.environ, 'FONTCONFIG_FILE': os.path.join(root, 'test-corpus/visual/fontconfig/fonts.conf')}
MM, CHROME = os.environ.get('MERMAID_DIR'), os.environ.get('CHROME')
# (label, fixture) — one per Mermaid type, in a pleasing order
TYPES = [('flowchart','colors'),('sequence','sequence'),('class','class-diagram'),('state','state-diagram'),
 ('er','er-diagram'),('gantt','gantt'),('pie','pie'),('mindmap','mindmap'),('timeline','timeline'),
 ('journey','journey'),('gitGraph','git-graph'),('quadrant','quadrant'),('requirement','requirement-diagram'),
 ('C4','c4'),('sankey','sankey'),('xychart','xychart'),('block','block'),('packet','packet'),
 ('kanban','kanban'),('architecture','architecture-diagram'),('radar','radar'),('treemap','treemap'),
 ('venn','venn'),('ishikawa','ishikawa'),('wardley','wardley'),('cynefin','cynefin'),
 ('treeView','tree-view'),('eventmodeling','eventmodeling'),('zenuml','zenuml')]

HTML = """<!doctype html><html><body style="margin:0;background:#fff"><div id="o" style="display:inline-block;padding:8px"></div>
<script type="module">
import mermaid from './node_modules/mermaid/dist/mermaid.esm.min.mjs';
import zen from './node_modules/@mermaid-js/mermaid-zenuml/dist/mermaid-zenuml.esm.min.mjs';
try { await mermaid.registerExternalDiagrams([zen]); } catch (e) {}
const src = await (await fetch(new URLSearchParams(location.search).get('f'))).text();
try { mermaid.initialize({startOnLoad:false, theme:'default'}); const {svg} = await mermaid.render('g', src);
  document.getElementById('o').innerHTML = svg; document.title = 'ok'; }
catch (e) { document.getElementById('o').textContent = 'ERR ' + e.message; document.title = 'err'; }
</script></body></html>"""

def crop(im, pad=10):
    b = ImageChops.difference(im, Image.new('RGB', im.size, (255, 255, 255))).getbbox()
    return im.crop((max(b[0]-pad, 0), max(b[1]-pad, 0), b[2]+pad, b[3]+pad)) if b else im

out = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(root, 'docs/showcase'))
os.makedirs(out, exist_ok=True)
work = tempfile.mkdtemp()
server = None
if MM and CHROME:
    open(os.path.join(MM, 'r.html'), 'w').write(HTML); os.makedirs(os.path.join(MM, 'src'), exist_ok=True)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k): pass
    handler = functools.partial(Quiet, directory=MM)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

def mermaid_render(name):
    """Real Mermaid.js render of the fixture, or None if Mermaid itself cannot render it."""
    if not server: return None
    shutil.copy(os.path.join(fx, name + '.mmd'), os.path.join(MM, 'src', name + '.mmd'))
    png = os.path.join(work, 'mm-' + name + '.png')
    dom = subprocess.run([CHROME, '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--screenshot=' + png,
        '--window-size=1500,1100', '--virtual-time-budget=10000', '--dump-dom',
        'http://127.0.0.1:%d/r.html?f=src/%s.mmd' % (server.server_port, name)], capture_output=True, text=True).stdout
    if '<title>ok</title>' not in dom and 'class="mermaid' not in dom and '<svg' not in dom: return None
    if 'ERR ' in dom.split('id="o"')[-1][:300]: return None
    return crop(Image.open(png).convert('RGB'))

tiles = []
for label, name in TYPES:
    mmd = open(os.path.join(fx, name + '.mmd')).read()
    md = os.path.join(work, name + '.md'); open(md, 'w').write('```mermaid\n' + mmd + '\n```\n')
    docx = os.path.join(work, name + '.docx')
    subprocess.run(['node', cli, md, '-o', docx], check=True, capture_output=True)
    subprocess.run(['soffice', '--headless', '--convert-to', 'png', '--outdir', work, docx],
                   check=True, capture_output=True, env=env)
    ours = crop(Image.open(os.path.join(work, name + '.png')).convert('RGB'))
    theirs = mermaid_render(name)
    tiles.append((label, theirs, ours)); print('ok', label, 'mermaid' if theirs else 'no-mermaid-render')

COLS, PW, PH, PAD, HEAD, SUB = 2, 440, 330, 12, 34, 24
TW = 2 * PW + 3 * 8
rows = -(-len(tiles) // COLS)
W = COLS * (TW + PAD) + PAD; H = 96 + rows * (PH + HEAD + SUB + PAD) + 40
canvas = Image.new('RGB', (W, H), '#F6F5FA'); d = ImageDraw.Draw(canvas)
def font(sz, bold=False):
    p = '/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf' % ('-Bold' if bold else '')
    return ImageFont.truetype(p, sz) if os.path.exists(p) else ImageFont.load_default()
d.text((PAD, 16), 'md2nativedocx — all 29 Mermaid diagram types: Mermaid.js vs native Word shapes', font=font(24, True), fill='#2B2140')
d.text((PAD, 52), 'Left: the diagram as rendered by Mermaid.js (a picture). Right: the same source exported by md2nativedocx — real, editable Word shapes (rendered here with LibreOffice).', font=font(13), fill='#555')
d.text((PAD, 72), 'Same input, same layout engine family; the difference is that the right-hand diagram is made of selectable shapes, not pixels.', font=font(13), fill='#555')
def panel(x, y, im, tag, color, missing):
    d.rounded_rectangle([x, y, x + PW, y + PH + SUB], 6, fill='white', outline='#E4E0EF')
    d.rectangle([x + 1, y + 1, x + PW - 1, y + SUB], fill=color)
    d.text((x + 8, y + 5), tag, font=font(12, True), fill='white')
    if im is None:
        d.text((x + 16, y + SUB + PH // 2 - 20), missing, font=font(12), fill='#999'); return
    t = im.copy(); t.thumbnail((PW - 16, PH - 12))
    canvas.paste(t, (x + (PW - t.width) // 2, y + SUB + (PH - t.height) // 2))
for i, (label, theirs, ours) in enumerate(tiles):
    x = PAD + (i % COLS) * (TW + PAD); y = 96 + (i // COLS) * (PH + HEAD + SUB + PAD)
    d.rounded_rectangle([x, y, x + TW, y + HEAD + PH + SUB + 8], 8, fill='#EFEDF8', outline='#DDD8EA')
    d.text((x + 10, y + 7), label, font=font(16, True), fill='#2B2140')
    panel(x + 8, y + HEAD, theirs, 'Mermaid.js', '#6B7280', 'Mermaid.js could not render this source\nin the version used for this page.')
    panel(x + 16 + PW, y + HEAD, ours, 'md2nativedocx → Word (native shapes)', '#7C3AED', '')
ver = ''
if MM:
    try: ver = ' %s' % json.load(open(os.path.join(MM, 'node_modules/mermaid/package.json')))['version']
    except OSError: pass
d.text((PAD, H - 28), 'Mermaid%s is MIT-licensed (c) Knut Sveidqvist and contributors — https://mermaid.js.org. Left panels rendered with it unmodified.' % ver, font=font(12), fill='#777')
canvas.save(os.path.join(out, 'preview.png'), optimize=True); print('wrote preview.png', canvas.size)
if server: server.shutdown()
shutil.rmtree(work)
