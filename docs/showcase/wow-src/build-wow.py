#!/usr/bin/env python3
"""Edit the showcase video from the raw takes recorded by shoot.ps1 (real VS Code / Word / PowerPoint)
and the carousel renders made by carousel.py (real Word).

Rendered frame by frame (Pillow + numpy) and piped to ffmpeg, so that every shot can cut and zoom:
each take is a list of pieces (hard cuts between them), each piece a source range, a speed and
keyframed crops that follow the gesture (wide -> punch in on the click -> back out). Cards are
animated the same way. Everything is local.

  python build-wow.py fr   -> out/wow-fr.mp4 (LinkedIn, 1080x1350)
  python build-wow.py en   -> out/wow-en.mp4 (shorter) and ../wow.gif (README: shapes, SmartArt, carousel)
"""
import os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
RAW, OUT = os.path.join(HERE, 'raw'), os.path.join(HERE, 'out')
CAROUSEL = os.path.join(RAW, 'carousel')
ICON = os.path.join(ROOT, 'packages', 'vscode-extension', 'icon.png')
FONTS = 'C:/Windows/Fonts/'
W, H, FPS = 1080, 1350, 30
SRC_W, SRC_H = 1920, 1032                 # the recorded screen area (taskbar excluded)
VIDEO_Y, VIDEO_H = 262, 700               # the take area in the frame
ASPECT = W / VIDEO_H
BG, PANEL, INK, MUTED, ACC, GREEN, RED, BLUE = '#1E1B2E', '#2B2140', '#F4F1FB', '#BDB6D6', '#8B5CF6', '#22C55E', '#F43F5E', '#0EA5E9'

def font(size, weight='b'):
    return ImageFont.truetype(FONTS + {'b': 'segoeuib.ttf', 'sb': 'seguisb.ttf', 'r': 'segoeui.ttf', 'm': 'consola.ttf'}[weight], size)

_icon_cache = {}
def icon(size):
    if size not in _icon_cache:
        _icon_cache[size] = Image.open(ICON).convert('RGBA').resize((size, size), Image.LANCZOS)
    return _icon_cache[size]

def ease(x):
    x = min(1.0, max(0.0, x)); return x * x * (3 - 2 * x)

def pop(t, start, dur=0.35):
    """0 -> 1 progress of an element appearing at `start`."""
    return ease((t - start) / dur)

# ---------------------------------------------------------------- text
TEXT = {
    'fr': {
        'hook': ('Votre schéma Mermaid', 'dans Word ?', 'Une image figée.'),
        'A': ('Avant : une image', ('Un clic : toute l’image se sélectionne.', 'Aucun texte modifiable.')),
        'E': ('Un clic dans VS Code', ('« Exporter en Word »…', '…et le document s’ouvre.')),
        'engine': ('Sous le capot', 'Analyse · mise en page · formes natives', '100 % local · rien n’est envoyé'),
        'B': ('De vraies formes Word', ('On retape le texte.', 'On déplace une boîte : la flèche suit.')),
        'C': ('Un vrai SmartArt', ('Une palette, un style 3D :', 'Word restyle tout le diagramme.')),
        'D': ('Et dans PowerPoint', ('Même source, même liberté.', '')),
        'K': '29 types de diagrammes',
        'badges': {'S': 'SmartArt', 'C': 'Graphique Word', 'F': 'Formes Word'},
        'end': ('Markdown + Mermaid', '→ Word · PowerPoint · LibreOffice', 'Des diagrammes que vous pouvez', 'vraiment modifier.',
                'Disponible sur', 'Gratuit · open source · 100 % local'),
    },
    'en': {
        'hook': ('Your Mermaid diagram', 'in Word?', 'A frozen picture.'),
        'A': ('Before: a picture', ('One click selects the whole picture.', 'No text to edit.')),
        'E': ('One click in VS Code', ('“Export to Word”…', '…and the document opens.')),
        'engine': ('Under the hood', 'Parse · lay out · native shapes', '100% local · nothing is uploaded'),
        'B': ('Real Word shapes', ('Retype the text.', 'Move a box: the arrow follows.')),
        'C': ('Real SmartArt', ('One palette, one 3D style:', 'Word restyles the whole diagram.')),
        'D': ('And in PowerPoint', ('Same source, same freedom.', '')),
        'K': '29 diagram types',
        'badges': {'S': 'SmartArt', 'C': 'Word chart', 'F': 'Word shapes'},
        'end': ('Markdown + Mermaid', '→ Word · PowerPoint · LibreOffice', 'Diagrams you can', 'actually edit.',
                'Available on', 'Free · open source · 100% local'),
    },
}
STORES = {'fr': ('VS Code Marketplace', 'Open VSX', 'npm · CLI', 'Filtre Pandoc'),
          'en': ('VS Code Marketplace', 'Open VSX', 'npm · CLI', 'Pandoc filter')}

# carousel: render name (carousel/<name>.md), label fr, label en, what Word gets
SLIDES = [
    ('03-mindmap', 'Carte mentale', 'Mind map', 'S'), ('05-pie', 'Camembert', 'Pie chart', 'C'),
    ('08-timeline', 'Frise chronologique', 'Timeline', 'S'), ('16-sankey', 'Sankey', 'Sankey', 'F'),
    ('12-class', 'Diagramme de classes', 'Class diagram', 'S'), ('06-xychart', 'Barres et courbes', 'Bar and line', 'C'),
    ('09-journey', 'Parcours client', 'User journey', 'S'), ('17-treemap', 'Treemap', 'Treemap', 'F'),
    ('14-gitgraph', 'Git graph', 'Git graph', 'F'), ('07-radar', 'Radar', 'Radar', 'C'),
    ('10-kanban', 'Kanban', 'Kanban', 'S'), ('13-state', 'Diagramme d’états', 'State diagram', 'S'),
    ('15-quadrant', 'Matrice de priorités', 'Quadrant chart', 'F'), ('19-venn', 'Venn', 'Venn', 'F'),
    ('02-sequence', 'Diagramme de séquence', 'Sequence diagram', 'F'),
]
BADGE_COL = {'S': ACC, 'C': GREEN, 'F': BLUE}

# ---------------------------------------------------------------- takes
# piece = (source start s, source end s, speed, [(source t, centre x, centre y, crop width), ...])
# coordinates are on the 1920x1032 recorded screen; between keyframes the crop glides (smoothstep).
TAKES = {
    'A': ('A-douleur.mp4', [
        (1.0, 7.6, 1.4, [(1.0, 900, 560, 1450), (1.9, 900, 560, 1450), (2.6, 640, 520, 820), (3.4, 640, 520, 820),
                          (4.2, 900, 520, 1550), (5.0, 900, 520, 1550), (5.8, 880, 470, 860)]),
    ]),
    'E': ('E-export.mp4', [
        (1.0, 4.3, 1.2, [(1.0, 620, 470, 1350), (2.6, 620, 470, 1350), (3.6, 360, 170, 680)]),
        (11.4, 13.6, 1.0, [(11.4, 1660, 920, 760), (13.6, 1680, 930, 700)]),
        (16.3, 18.6, 1.0, [(16.3, 950, 480, 1500), (18.6, 950, 480, 1080)]),
    ]),
    'B': ('B-formes.mp4', [
        (1.6, 5.4, 1.15, [(1.6, 955, 560, 1560), (2.2, 955, 560, 1560), (2.8, 640, 510, 760), (5.4, 640, 510, 700)]),
        (5.6, 11.2, 1.25, [(5.6, 955, 560, 1560), (7.2, 955, 560, 1560), (9.6, 820, 600, 1150), (10.4, 955, 560, 1560)]),
    ]),
    'C': ('C-smartart.mp4', [
        (1.8, 4.4, 1.4, [(1.8, 920, 560, 1100), (4.4, 920, 480, 1300)]),
        (4.6, 10.2, 1.5, [(4.6, 1000, 430, 1150), (6.0, 1030, 470, 980), (9.4, 1030, 470, 980), (10.2, 920, 520, 1150)]),
        (10.4, 16.8, 1.6, [(10.4, 1150, 360, 1450), (12.8, 1150, 360, 1450), (14.4, 920, 570, 1000), (16.8, 920, 570, 960)]),
    ]),
    'D': ('D-pptx.mp4', [
        (1.6, 6.9, 1.25, [(1.6, 1104, 600, 1560), (2.4, 830, 550, 800), (5.2, 830, 550, 760), (6.1, 1104, 600, 1560)]),
    ]),
}

def crop_at(keys, t):
    if t <= keys[0][0]: return keys[0][1:]
    for (t0, *a), (t1, *b) in zip(keys, keys[1:]):
        if t <= t1:
            e = ease((t - t0) / (t1 - t0)); return tuple(x + (y - x) * e for x, y in zip(a, b))
    return keys[-1][1:]

def crop_box(cx, cy, cw):
    cw = min(cw, SRC_W, SRC_H * ASPECT); ch = cw / ASPECT
    x0 = min(max(cx - cw / 2, 0), SRC_W - cw); y0 = min(max(cy - ch / 2, 0), SRC_H - ch)
    return (x0, y0, x0 + cw, y0 + ch)

class Reader:
    """Sequential frames of a take from `start`, read through ffmpeg (forward only)."""
    def __init__(self, path, start):
        self.p = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-ss', f'{start:.3f}', '-i', path, '-f', 'rawvideo',
                                   '-pix_fmt', 'rgb24', '-r', str(FPS), '-'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        self.start, self.i, self.frame = start, -1, None
    def at(self, t):
        want = int(round((t - self.start) * FPS))
        while self.i < want:
            b = self.p.stdout.read(SRC_W * SRC_H * 3)
            if len(b) < SRC_W * SRC_H * 3: break
            self.frame = np.frombuffer(b, np.uint8).reshape(SRC_H, SRC_W, 3); self.i += 1
        return self.frame
    def close(self):
        self.p.stdout.close(); self.p.kill()

# ---------------------------------------------------------------- frames
def frame_bg(title, caption, bad=False):
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    im.paste(icon(60), (48, 42), icon(60))
    d.text((124, 50), 'md2nativedocx', font=font(32, 'sb'), fill=MUTED)
    d.ellipse([50, 158, 74, 182], fill=RED if bad else GREEN)
    d.text((92, 134), title, font=font(56), fill=INK)
    d.rectangle([0, VIDEO_Y - 6, W, VIDEO_Y + VIDEO_H + 6], fill=PANEL)
    y = VIDEO_Y + VIDEO_H + 56
    for i, line in enumerate(l for l in caption if l):
        centered(d, y + i * 64, line, font(46 if i == 0 else 40, 'sb' if i == 0 else 'r'), INK if i == 0 else MUTED)
    return im

def centered(d, y, text, f, fill, x=W / 2):
    d.text((x - d.textlength(text, font=f) / 2, y), text, font=f, fill=fill)

def take_frames(key, t):
    take, pieces = TAKES[key]
    title, caption = t[key]
    bg = frame_bg(title, caption, bad=(key == 'A'))
    for a, b, speed, keys in pieces:
        r = Reader(os.path.join(RAW, take), a)
        n = int(round((b - a) / speed * FPS))
        for k in range(n):
            ts = a + k * speed / FPS
            src = Image.fromarray(r.at(ts))
            cx, cy, cw = crop_at(keys, ts)
            punch = 1 + 0.05 * (1 - ease(k / 8))           # small zoom punch on every cut
            box = crop_box(cx, cy, cw / punch)
            im = bg.copy()
            im.paste(src.resize((W, VIDEO_H), Image.BICUBIC, box=box), (0, VIDEO_Y))
            yield im
        r.close()

def text_layer(im, draws, t):
    """draws: [(start, fn(draw, alpha, dy))]: each element fades and slides in at its start."""
    for start, fn in draws:
        a = pop(t, start)
        if a <= 0: continue
        layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
        fn(ImageDraw.Draw(layer), layer, int(24 * (1 - a)))
        if a < 1:
            alpha = layer.getchannel('A').point(lambda v: int(v * a)); layer.putalpha(alpha)
        im.alpha_composite(layer)

def card_frames(dur, draws):
    for k in range(int(dur * FPS)):
        im = Image.new('RGBA', (W, H), BG)
        text_layer(im, draws, k / FPS)
        yield im.convert('RGB')

def T(y, text, size, weight, fill):
    return lambda d, l, dy: centered(d, y + dy, text, font(size, weight), fill)

def hook_frames(t):
    h1, h2, h3 = t['hook']
    return card_frames(2.6, [(0.0, T(470, h1, 78, 'b', INK)), (0.25, T(570, h2, 78, 'b', INK)), (0.9, T(740, h3, 68, 'b', RED))])

def engine_frames(t):
    title, steps, local = t['engine']
    code = ['```mermaid', 'flowchart LR', '  user([Clients])', '    --> fw{Pare-feu}', '  fw --> lb[Répartiteur]', '  subgraph cloud', '    app1 --> db[(Base)]', '```']
    outs = [('.docx', 'Word', '#2B579A'), ('.pptx', 'PowerPoint', '#C43E1C'), ('.odt', 'LibreOffice', '#18A303')]
    dur = 3.6
    for k in range(int(dur * FPS)):
        s = k / FPS
        im = Image.new('RGBA', (W, H), BG); d = ImageDraw.Draw(im)
        text_layer(im, [(0.0, T(250, title, 60, 'b', INK))], s)
        # Mermaid source typed in
        d.rounded_rectangle([50, 430, 470, 870], 22, fill=PANEL)
        shown = int(len(''.join(code)) * ease(s / 1.1))
        y = 462
        for line in code:
            part = line[:max(0, shown)]; shown -= len(line)
            d.text((76, y), part, font=font(27, 'm'), fill='#C4B5FD' if line.startswith('```') else INK); y += 49
        # arrow + engine
        g = ease((s - 0.9) / 0.4)
        if g > 0:
            d.line([490, 650, 490 + 70 * g, 650], fill=ACC, width=8)
            if g >= 1: d.polygon([(568, 650), (548, 636), (548, 664)], fill=ACC)
        e = pop(s, 1.1, 0.3)
        if e > 0:
            sz = int(120 * (0.7 + 0.3 * e)); ic = icon(sz)
            im.alpha_composite(ic, (640 - sz // 2, 650 - sz // 2))
        # three outputs
        for i, (ext, app, col) in enumerate(outs):
            o = pop(s, 1.5 + 0.25 * i, 0.3)
            if o <= 0: continue
            y0 = 470 + i * 140 + int(20 * (1 - o))
            layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(layer)
            ld.rounded_rectangle([730, y0, 1030, y0 + 110], 20, fill=col)
            ld.text((756, y0 + 14), ext, font=font(40, 'b'), fill='#FFFFFF')
            ld.text((756, y0 + 62), app, font=font(30, 'sb'), fill='#FFFFFFDD')
            layer.putalpha(layer.getchannel('A').point(lambda v: int(v * o)))
            im.alpha_composite(layer)
            if o > 0.5: d.line([705, 650, 728, y0 + 55], fill=MUTED, width=3)
        text_layer(im, [(1.3, T(960, steps, 40, 'sb', MUTED)), (2.4, T(1040, local, 40, 'sb', GREEN))], s)
        yield im.convert('RGB')

def carousel_frames(t, per=0.46):
    lang = 'fr' if t is TEXT['fr'] else 'en'
    for name, fr, en, kind in SLIDES:
        src = Image.open(os.path.join(CAROUSEL, name + '.png')).convert('RGB')
        label, badge = (fr if lang == 'fr' else en), t['badges'][kind]
        bg = frame_bg(t['K'], ('', ''))
        d = ImageDraw.Draw(bg)
        centered(d, VIDEO_Y + VIDEO_H + 52, label, font(50, 'b'), INK)
        bf = font(34, 'sb'); bw = d.textlength(badge, font=bf) + 44
        d.rounded_rectangle([(W - bw) / 2, VIDEO_Y + VIDEO_H + 134, (W + bw) / 2, VIDEO_Y + VIDEO_H + 190], 28, fill=BADGE_COL[kind])
        centered(d, VIDEO_Y + VIDEO_H + 140, badge, bf, '#FFFFFF')
        # fit the render on a white page, then a slow push-in
        page = Image.new('RGB', (W, VIDEO_H), 'white')
        sc = min((W - 80) / src.width, (VIDEO_H - 60) / src.height)
        fit = src.resize((int(src.width * sc), int(src.height * sc)), Image.LANCZOS)
        page.paste(fit, ((W - fit.width) // 2, (VIDEO_H - fit.height) // 2))
        n = int(per * FPS)
        for k in range(n):
            z = 1 + 0.06 * k / n
            cw, ch = W / z, VIDEO_H / z
            im = bg.copy()
            im.paste(page.resize((W, VIDEO_H), Image.BICUBIC, box=((W - cw) / 2, (VIDEO_H - ch) / 2, (W + cw) / 2, (VIDEO_H + ch) / 2)), (0, VIDEO_Y))
            yield im

def end_frames(t):
    e1, e2, e3, e4, avail, free = t['end']
    def logo(d, l, dy):
        l.alpha_composite(icon(150), ((W - 150) // 2, 150 + dy))
    stores = STORES['fr' if t is TEXT['fr'] else 'en']
    f = font(34, 'sb'); meas = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    widths = [meas.textlength(n, font=f) + 48 for n in stores]
    def store(i, name):
        def fn(d, l, dy):
            row = i // 2; a, b = widths[row * 2], widths[row * 2 + 1]
            left = (W - (a + 24 + b)) / 2                      # each row of two chips centred
            x = left if i % 2 == 0 else left + a + 24
            y = 870 + row * 80 + dy
            d.rounded_rectangle([x, y, x + widths[i], y + 60], 30, fill=PANEL, outline=ACC, width=2)
            d.text((x + 24, y + 8), name, font=f, fill=INK)
        return fn
    draws = [(0.0, logo), (0.1, T(320, 'md2nativedocx', 70, 'b', INK)), (0.35, T(430, e1, 46, 'sb', ACC)),
             (0.5, T(490, e2, 46, 'sb', ACC)), (0.8, T(610, e3, 54, 'b', INK)), (0.9, T(680, e4, 54, 'b', INK)),
             (1.4, T(800, avail, 36, 'r', MUTED))]
    draws += [(1.6 + 0.18 * i, store(i, n)) for i, n in enumerate(stores)]
    draws += [(2.6, T(1080, free, 36, 'r', MUTED))]
    return card_frames(4.6, draws)

# ---------------------------------------------------------------- assembly
def build(lang):
    t = TEXT[lang]
    short = lang == 'en'
    parts = [] if short else [hook_frames(t), take_frames('A', t)]
    parts += [take_frames('E', t), engine_frames(t), take_frames('B', t), take_frames('C', t)]
    if not short: parts.append(take_frames('D', t))
    parts += [carousel_frames(t), end_frames(t)]
    mp4 = os.path.join(OUT, f'wow-{lang}.mp4')
    enc = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                            '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4],
                           stdin=subprocess.PIPE)
    # frame count known up front (for the progress bar) without holding the frames in memory
    keys = ([] if short else ['A']) + ['E', 'B', 'C'] + ([] if short else ['D'])
    total = sum(int(round((b - a) / s * FPS)) for k in keys for a, b, s, _ in TAKES[k][1])
    total += int(3.6 * FPS) + len(SLIDES) * int(0.46 * FPS) + int(4.6 * FPS) + (0 if short else int(2.6 * FPS))
    i = 0
    for p in parts:
        for im in p:
            i += 1
            ImageDraw.Draw(im).rectangle([0, H - 8, int(W * min(1, i / total)), H], fill=ACC)
            enc.stdin.write(im.tobytes())
    enc.stdin.close(); enc.wait()
    print('wrote', mp4, f'{i / FPS:.1f} s (expected {total / FPS:.1f})')
    if short:
        gif = os.path.join(ROOT, 'docs', 'showcase', 'wow.gif')
        pal = os.path.join(RAW, 'pal.png')
        # the README GIF keeps the proof only (Word shapes, SmartArt, carousel): light enough to load
        fr = lambda k: sum(int(round((b - a) / s * FPS)) for a, b, s, _ in TAKES[k][1])
        start = (fr('E') + int(3.6 * FPS)) / FPS
        span = ['-ss', f'{start:.2f}', '-t', f'{(fr("B") + fr("C") + len(SLIDES) * int(0.46 * FPS)) / FPS:.2f}']
        vf = 'fps=8,scale=420:-1:flags=lanczos'
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y'] + span + ['-i', mp4, '-vf', vf + ',palettegen=max_colors=96:stats_mode=diff', pal], check=True)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y'] + span + ['-i', mp4, '-i', pal, '-lavfi',
                        vf + '[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', gif], check=True)
        print('wrote', gif, os.path.getsize(gif) // 1024, 'KB')

if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'fr')
