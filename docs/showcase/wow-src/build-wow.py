#!/usr/bin/env python3
"""Edit the showcase video from the raw takes recorded by shoot.ps1 (real Word / PowerPoint).

Layout 1080x1350 (4:5, LinkedIn feed): brand header, the take in the middle, a caption below; a hook
card first, a bridge card, an end card. Everything is local: Pillow draws the cards and frames,
ffmpeg cuts, scales and concatenates.

  python build-wow.py fr   -> out/wow-fr.mp4 (LinkedIn)
  python build-wow.py en   -> out/wow-en.mp4 and ../wow.gif (README; shorter: proof + SmartArt only)
"""
import os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
RAW, OUT = os.path.join(HERE, 'raw'), os.path.join(HERE, 'out')
ICON = os.path.join(ROOT, 'packages', 'vscode-extension', 'icon.png')
FONTS = 'C:/Windows/Fonts/'
W, H, FPS = 1080, 1350, 30
VIDEO_Y, VIDEO_H = 250, 857           # a 1300x1032 screen crop scaled to 1080 wide
BG, PANEL, INK, MUTED, ACC, GREEN, RED = '#1E1B2E', '#2B2140', '#F4F1FB', '#BDB6D6', '#8B5CF6', '#22C55E', '#F43F5E'

def font(size, weight='b'):
    return ImageFont.truetype(FONTS + {'b': 'segoeuib.ttf', 'sb': 'seguisb.ttf', 'r': 'segoeui.ttf'}[weight], size)

TEXT = {
    'fr': {
        'hook1': 'Votre schéma Mermaid', 'hook2': 'dans Word ?', 'hook3': 'Une image figée.',
        'A_t': 'Avant', 'A_c': ('Un clic : toute l’image se sélectionne.', 'Aucun texte modifiable.'),
        'bridge1': 'Avec md2nativedocx,', 'bridge2': 'le même Markdown devient…',
        'B_t': 'De vraies formes Word', 'B_c': ('On retape le texte.', 'On déplace une boîte : les flèches suivent.'),
        'C_t': 'Un vrai SmartArt', 'C_c': ('Une palette, un style 3D :', 'Word restyle tout le diagramme.'),
        'D_t': 'Et dans PowerPoint', 'D_c': ('Même source, même liberté.', ''),
        'end1': 'Markdown + Mermaid', 'end2': '→ Word, PowerPoint, LibreOffice',
        'end3': 'Des diagrammes que vous pouvez', 'end4': 'vraiment modifier.',
        'end5': 'Gratuit · open source · 100 % local', 'end6': 'VS Code · Open VSX · npm',
    },
    'en': {
        'hook1': 'Your Mermaid diagram', 'hook2': 'in Word?', 'hook3': 'A frozen picture.',
        'A_t': 'Before', 'A_c': ('One click selects the whole picture.', 'No text to edit.'),
        'bridge1': 'With md2nativedocx,', 'bridge2': 'the same Markdown becomes…',
        'B_t': 'Real Word shapes', 'B_c': ('Retype the text.', 'Move a box: the arrows follow.'),
        'C_t': 'Real SmartArt', 'C_c': ('One palette, one 3D style:', 'Word restyles the whole diagram.'),
        'D_t': 'And in PowerPoint', 'D_c': ('Same source, same freedom.', ''),
        'end1': 'Markdown + Mermaid', 'end2': '→ Word, PowerPoint, LibreOffice',
        'end3': 'Diagrams you can', 'end4': 'actually edit.',
        'end5': 'Free · open source · 100% local', 'end6': 'VS Code · Open VSX · npm',
    },
}

# take, start, end (s in the raw take), speed, crop (width, x, y) of the 1920x1032 screen; the crop
# height follows the video area's aspect (1080:857), so each take is framed on its gestures.
CLIPS = {
    'A': ('A-douleur.mp4', 1.0, 7.4, 1.2, (880, 360, 300)),
    'B': ('B-formes.mp4', 1.0, 14.6, 1.4, (940, 330, 300)),
    'C': ('C-smartart.mp4', 2.0, 17.2, 1.5, (1180, 470, 40)),
    'D': ('D-pptx.mp4', 1.0, 9.8, 1.4, (800, 566, 280)),
}

def centered(d, y, text, f, fill):
    w = d.textlength(text, font=f); d.text(((W - w) / 2, y), text, font=f, fill=fill)

def icon(size):
    return Image.open(ICON).convert('RGBA').resize((size, size), Image.LANCZOS)

def frame(title, caption, bad=False):
    """Header (logo + step title) and caption band around the video area."""
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    im.paste(icon(64), (48, 40), icon(64))
    d.text((128, 50), 'md2nativedocx', font=font(34, 'sb'), fill=MUTED)
    dot = RED if bad else GREEN
    d.ellipse([48, 150, 72, 174], fill=dot)
    d.text((90, 128), title, font=font(56), fill=INK)
    d.rectangle([0, VIDEO_Y - 6, W, VIDEO_Y + VIDEO_H + 6], fill=PANEL)
    y = VIDEO_Y + VIDEO_H + 40
    for i, line in enumerate(l for l in caption if l):
        centered(d, y + i * 62, line, font(44 if i == 0 else 40, 'sb' if i == 0 else 'r'), INK if i == 0 else MUTED)
    return im

def card(lines):
    """Full-screen title card: [(text, size, weight, colour, gap_before)]."""
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    total = sum(s + g for _, s, _, _, g in lines)
    y = (H - total) / 2
    for text, size, weight, colour, gap in lines:
        y += gap
        if text == '@icon':
            ic = icon(size); im.paste(ic, ((W - size) // 2, int(y)), ic)
        else:
            centered(d, y, text, font(size, weight), colour)
        y += size
    return im

def run(args):
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y'] + args, check=True)

ENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS)]

def card_segment(im, dur, path, work):
    png = path + '.png'; im.save(png)
    run(['-loop', '1', '-t', str(dur), '-i', png, '-vf',
         f'fade=t=in:st=0:d=0.3,fade=t=out:st={dur - 0.3}:d=0.3'] + ENC + [path])

def clip_segment(key, t, path):
    take, a, b, speed, (cw, cx, cy) = CLIPS[key]
    ch = round(cw * VIDEO_H / W / 2) * 2
    bg = path + '.png'; frame(t[key + '_t'], t[key + '_c'], bad=(key == 'A')).save(bg)
    dur = (b - a) / speed
    fc = (f'[1:v]crop={cw}:{ch}:{cx}:{cy},scale={W}:{VIDEO_H},setpts=(PTS-STARTPTS)/{speed}[v];'
          f'[0:v][v]overlay=0:{VIDEO_Y}:shortest=1,fade=t=in:st=0:d=0.25,fade=t=out:st={dur - 0.3:.2f}:d=0.3[o]')
    run(['-loop', '1', '-i', bg, '-ss', str(a), '-to', str(b), '-i', os.path.join(RAW, take),
         '-filter_complex', fc, '-map', '[o]', '-t', f'{dur:.2f}'] + ENC + [path])

def build(lang):
    t = TEXT[lang]; work = tempfile.mkdtemp(); segs = []
    def seg(name): p = os.path.join(work, name + '.mp4'); segs.append(p); return p
    hook = card([(t['hook1'], 76, 'b', INK, 0), (t['hook2'], 76, 'b', INK, 10), (t['hook3'], 64, 'sb', RED, 60)])
    bridge = card([('@icon', 150, '', '', 0), (t['bridge1'], 60, 'b', INK, 50), (t['bridge2'], 52, 'r', MUTED, 16)])
    end = card([('@icon', 170, '', '', 0), ('md2nativedocx', 72, 'b', INK, 40), (t['end1'], 48, 'sb', ACC, 50),
                (t['end2'], 48, 'sb', ACC, 10), (t['end3'], 52, 'b', INK, 60), (t['end4'], 52, 'b', INK, 8),
                (t['end5'], 38, 'r', MUTED, 60), (t['end6'], 38, 'r', MUTED, 12)])
    short = lang == 'en'
    if not short:
        card_segment(hook, 2.6, seg('0-hook'), work)
        clip_segment('A', t, seg('1-A'))
    card_segment(bridge, 1.8, seg('2-bridge'), work)
    clip_segment('B', t, seg('3-B'))
    clip_segment('C', t, seg('4-C'))
    if not short:
        clip_segment('D', t, seg('5-D'))
    card_segment(end, 3.8, seg('6-end'), work)
    lst = os.path.join(work, 'list.txt')
    with open(lst, 'w') as f:
        f.writelines(f"file '{p}'\n" for p in segs)
    mp4 = os.path.join(OUT, f'wow-{lang}.mp4')
    run(['-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', mp4])
    print('wrote', mp4)
    if short:
        gif = os.path.join(ROOT, 'docs', 'showcase', 'wow.gif')
        pal = os.path.join(work, 'pal.png')
        run(['-i', mp4, '-vf', 'fps=10,scale=480:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff', pal])
        run(['-i', mp4, '-i', pal, '-lavfi', 'fps=10,scale=480:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', gif])
        print('wrote', gif, os.path.getsize(gif) // 1024, 'KB')

if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'fr')
