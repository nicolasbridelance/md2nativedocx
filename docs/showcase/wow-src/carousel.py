#!/usr/bin/env python3
"""Export every carousel/*.md with the real CLI (landscape page, SmartArt and Word charts on, as a user
gets them by default), render page 1 in the real Word (render-page.ps1) and crop it to the diagram.
Output: raw/carousel/<name>.png, used by build-wow.py for the fast type carousel."""
import glob, os, subprocess, sys
from PIL import Image, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(HERE, 'raw', 'carousel'); os.makedirs(OUT, exist_ok=True)
PANDOC = os.path.join(os.environ['APPDATA'], 'Code', 'User', 'globalStorage', 'md2nativedocx.md2nativedocx', 'pandoc', '3.1.3', 'win32-x64', 'pandoc.exe')
env = dict(os.environ, MD2NATIVEDOCX_PANDOC_BIN=os.environ.get('MD2NATIVEDOCX_PANDOC_BIN', PANDOC), MD2NATIVEDOCX_ORIENTATION='landscape')

only = sys.argv[1:]
for md in sorted(glob.glob(os.path.join(HERE, 'carousel', '*.md'))):
    name = os.path.splitext(os.path.basename(md))[0]
    if only and not any(o in name for o in only): continue
    docx = os.path.join(OUT, name + '.docx')
    r = subprocess.run(['node', os.path.join(ROOT, 'packages', 'cli', 'bin', 'md2nativedocx.mjs'), md, '-o', docx], env=env, capture_output=True, text=True)
    warn = [l for l in (r.stdout + r.stderr).splitlines() if 'warning' in l]
    subprocess.run(['powershell', '-ExecutionPolicy', 'Bypass', '-File', os.path.join(HERE, 'render-page.ps1'), docx, OUT, name + '-p'], check=True)
    im = Image.open(os.path.join(OUT, name + '-p1.png')).convert('RGB')
    box = ImageChops.difference(im, Image.new('RGB', im.size, 'white')).getbbox()
    pad = 60
    im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad))).save(os.path.join(OUT, name + '.png'))
    for p in glob.glob(os.path.join(OUT, name + '-p*.png')): os.remove(p)
    print(name, 'ok', *warn)
