#!/usr/bin/env python3
"""Build docs/showcase/wow.gif: Mermaid source is typed, "Export to Word" is clicked, and the real
native-shape export (rendered with headless LibreOffice) appears — for a few colourful diagram types.
Requires node, pandoc, soffice, ffmpeg, Pillow. Usage: python3 scripts/build-showcase-gif.py [outfile]
"""
import os, subprocess, sys, tempfile, shutil
from PIL import Image, ImageChops, ImageDraw, ImageFont

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fx = os.path.join(root, 'test-corpus/visual/fixtures')
cli = os.path.join(root, 'packages/cli/bin/md2nativedocx.mjs')
env = {**os.environ, 'FONTCONFIG_FILE': os.path.join(root, 'test-corpus/visual/fontconfig/fonts.conf')}
SCENES = [('sankey', 'sankey', 0), ('mindmap', 'mindmap', 0), ('venn', 'venn', 0), ('timeline', 'timeline', 0), ('treemap', 'treemap', 0)]
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'docs/showcase/wow.gif')
W, H = 800, 450
work = tempfile.mkdtemp(); frames = os.path.join(work, 'f'); os.makedirs(frames)
F = lambda s, b=False: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVu%s%s.ttf' % ('SansMono' if not b else 'Sans', '-Bold' if b else ''), s)
BG, PANEL, INK, ACC = '#1E1B2E', '#2B2140', '#E8E4F5', '#8B5CF6'
n = 0
def save(im):
    global n; im.save(os.path.join(frames, 'f%04d.png' % n)); n += 1

def render(name):
    mmd = open(os.path.join(fx, name + '.mmd')).read()
    md = os.path.join(work, name + '.md'); open(md, 'w').write('```mermaid\n' + mmd + '\n```\n')
    docx = os.path.join(work, name + '.docx')
    subprocess.run(['node', cli, md, '-o', docx], check=True, capture_output=True)
    subprocess.run(['soffice', '--headless', '--convert-to', 'png', '--outdir', work, docx], check=True, capture_output=True, env=env)
    im = Image.open(os.path.join(work, name + '.png')).convert('RGB')
    b = ImageChops.difference(im, Image.new('RGB', im.size, (255, 255, 255))).getbbox()
    return mmd, im.crop((max(b[0]-10, 0), max(b[1]-10, 0), b[2]+10, b[3]+10))

def base(label, code, shown, button=0, result=None, alpha=1.0):
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 34], fill=PANEL)
    for i, c in enumerate(['#FF5F57', '#FEBC2E', '#28C840']): d.ellipse([12 + i*20, 11, 24 + i*20, 23], fill=c)
    d.text((W//2 - 190, 9), 'report.md — Visual Studio Code' if result is None else 'report.docx — rendered here with LibreOffice', font=F(13, True), fill='#BDB6D6')
    d.rounded_rectangle([14, 48, 330, H-14], 8, fill='#16131F')
    d.text((26, 56), '```mermaid', font=F(12), fill='#7C7A99')
    lines = code[:shown].split('\n')[:16]
    for i, l in enumerate(lines): d.text((26, 76 + i*19), l[:42], font=F(11), fill=INK)
    if shown < len(code): d.rectangle([26, 76 + (len(lines)-1)*19 + 15, 34, 78 + (len(lines)-1)*19 + 17], fill=ACC)
    # right panel
    d.rounded_rectangle([344, 48, W-14, H-14], 8, fill='white')
    if result is not None:
        r = result.copy(); r.thumbnail((W-14-344-24, H-14-48-24))
        if alpha < 1: r = Image.blend(Image.new('RGB', r.size, 'white'), r, alpha)
        im.paste(r, (344 + (W-14-344-r.width)//2, 48 + (H-14-48-r.height)//2))
        d.rounded_rectangle([W-232, H-52, W-24, H-26], 13, fill='#16A34A'); d.text((W-218, H-46), '✓ native editable shapes', font=F(12, True), fill='white')
    else:
        d.text((560, 220), label, font=F(14, True), fill='#BBB')
    if button:
        c = ACC if button == 1 else '#C4B5FD'
        d.rounded_rectangle([26, H-62, 170, H-30], 8, fill=c); d.text((38, H-52), '⚙ Export to Word', font=F(12, True), fill='white')
    return im

for label, name, cut in SCENES:
    mmd, res = render(name)
    code = '\n'.join(mmd.strip().split('\n')[:14])
    step = max(len(code)//8, 12)
    for k in range(0, len(code) + step, step): save(base(label, code, k))
    save(base(label, code, len(code), button=1))
    save(base(label, code, len(code), button=2))
    save(base(label, code, len(code), button=2))
    for a in (0.3, 0.6, 1.0): save(base(label, code, len(code), result=res, alpha=a))
    for _ in range(7): save(base(label, code, len(code), result=res))
subprocess.run(['ffmpeg', '-y', '-framerate', '6', '-i', os.path.join(frames, 'f%04d.png'), '-vf',
    'fps=6,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', out], check=True, capture_output=True)
shutil.rmtree(work); print(out, os.path.getsize(out)//1024, 'KB')
