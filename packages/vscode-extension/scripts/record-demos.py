#!/usr/bin/env python3
"""
Records the README / Marketplace demo GIFs of the VS Code extension (docs/demo-*.gif) in a real VS Code
window, so they can be re-shot whenever the UI changes instead of being rebuilt from memory (the first GIFs,
2026-09, kept no script — see docs/demo-script.md).

How: a virtual display (Xvfb :99, 1280x800), the VS Code build the extension-host tests already downloaded
(.vscode-test/vscode-linux-x64-<version>/code), a fresh throw-away profile per scenario, xdotool for the
mouse and keyboard, ffmpeg x11grab for the capture, then a palette-optimised GIF.

    python3 scripts/record-demos.py                 # every scenario
    python3 scripts/record-demos.py hover pptx      # some of them
    python3 scripts/record-demos.py --shots hover   # no video: a PNG after each step, to check positions

Needs Xvfb, xdotool, ffmpeg, a built extension (npm run build) and `npm run test:extension-host` run once
(downloads VS Code). Click positions are for that 1280x800 window with the settings in SETTINGS below; if
the UI moves, run with --shots and adjust the coordinates in SCENARIOS.

Traps already met (keep them in mind):
  - The VS Code that runs this Codespace exports VSCODE_* / ELECTRON_RUN_AS_NODE variables; inherited, they
    make the launched window die ~15 s after start ("renderer process gone, killed, 15"). The window is
    started with `env -i` and a minimal environment.
  - The profile directory must have a short path (Unix socket path limit, 108 bytes): /tmp/vsd.
  - A continuous ffmpeg x11grab made VS Code kill the filmed window within seconds; takes are made of
    single-frame grabs instead (see Recording).
"""

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

EXT_ROOT = Path(__file__).resolve().parent.parent
DOCS = EXT_ROOT / 'docs'
DISPLAY = ':99'
SIZE = (1280, 800)
PROFILE = Path('/tmp/vsd')
WORK = Path('/tmp/vsd-ws')
SHOTS = Path('/tmp/vsd-shots')
# The extension downloads its pinned Pandoc into globalStorage on first export; kept here between profiles so
# a take never shows the one-time "Setting up Pandoc" download.
STORAGE_CACHE = Path('/tmp/vsd-storage-cache')
STORAGE = Path('user') / 'User' / 'globalStorage' / 'md2nativedocx.md2nativedocx'

SETTINGS = {
    'workbench.colorTheme': 'Default Light Modern',
    'workbench.startupEditor': 'none',
    'workbench.tips.enabled': False,
    'editor.minimap.enabled': False,
    'editor.fontSize': 15,
    'window.zoomLevel': 0,
    'telemetry.telemetryLevel': 'off',
    'update.mode': 'none',
    'extensions.ignoreRecommendations': True,
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
    'chat.commandCenter.enabled': False,
    'chat.disableAIFeatures': True,
    'workbench.layoutControl.enabled': False,
    'security.workspace.trust.enabled': False,
    'git.enabled': False,
    'workbench.editor.empty.hint': 'hidden',
    'editor.hover.delay': 300,
    # Not visible on screen, and would download .NET into every fresh profile: off for the takes only.
    'md2nativedocx.wordCompatibilityCheck.enabled': False,
}


def vscode_binary() -> Path:
    builds = sorted((EXT_ROOT / '.vscode-test').glob('vscode-linux-x64-*/code'))
    if not builds:
        sys.exit('No VS Code build in .vscode-test/ — run `npm run test:extension-host` once first.')
    return builds[-1]


def sh(*args: str) -> None:
    subprocess.run(args, check=True, env={**os.environ, 'DISPLAY': DISPLAY})


def wait(seconds: float) -> None:
    time.sleep(seconds)


# --- input ----------------------------------------------------------------------------------------

def move(x: int, y: int, steps: int = 12, duration: float = 0.5) -> None:
    """Glide the pointer to (x, y) so the GIF shows where it goes."""
    out = subprocess.run(['xdotool', 'getmouselocation', '--shell'], capture_output=True, text=True,
                         env={**os.environ, 'DISPLAY': DISPLAY}).stdout
    pos = dict(line.split('=') for line in out.split() if '=' in line)
    x0, y0 = int(pos.get('X', x)), int(pos.get('Y', y))
    for i in range(1, steps + 1):
        sh('xdotool', 'mousemove', str(x0 + (x - x0) * i // steps), str(y0 + (y - y0) * i // steps))
        wait(duration / steps)


def click(x: int, y: int, button: int = 1) -> None:
    move(x, y)
    wait(0.25)
    sh('xdotool', 'click', str(button))


def keys(*combo: str) -> None:
    sh('xdotool', 'key', *combo)


def palette(command: str) -> None:
    keys('ctrl+shift+p')
    wait(0.6)
    sh('xdotool', 'type', '--delay', '15', command)
    wait(0.6)
    keys('Return')


# --- environment ----------------------------------------------------------------------------------

def start_display() -> None:
    if subprocess.run(['xdpyinfo', '-display', DISPLAY], capture_output=True).returncode != 0:
        subprocess.Popen(['Xvfb', DISPLAY, '-screen', '0', f'{SIZE[0]}x{SIZE[1]}x24'],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        wait(1.5)


def stop_vscode() -> None:
    subprocess.run(['pkill', '-9', '-f', '[v]scode-linux-x64'], check=False)
    subprocess.run(['pkill', '-9', '-f', '[c]hrome_crashpad'], check=False)
    wait(1)


def fresh_workspace() -> None:
    shutil.rmtree(WORK, ignore_errors=True)
    WORK.mkdir(parents=True)
    for name in ('demo-workflow.md', 'demo-no-diagram.md', 'demo-raw.mmd'):
        shutil.copy(DOCS / name, WORK / name)


def launch(open_file: str) -> None:
    stop_vscode()
    shutil.rmtree(PROFILE, ignore_errors=True)
    (PROFILE / 'user' / 'User').mkdir(parents=True)
    (PROFILE / 'ext').mkdir(parents=True)
    (PROFILE / 'user' / 'User' / 'settings.json').write_text(json.dumps(SETTINGS, indent=2))
    if STORAGE_CACHE.exists():
        shutil.copytree(STORAGE_CACHE, PROFILE / STORAGE)
    env = {'HOME': os.environ.get('HOME', '/root'), 'PATH': '/usr/local/bin:/usr/bin:/bin', 'DISPLAY': DISPLAY,
           'LANG': 'en_US.UTF-8'}
    subprocess.Popen(
        [str(vscode_binary()), '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', f'--user-data-dir={PROFILE / "user"}',
         f'--extensions-dir={PROFILE / "ext"}', f'--extensionDevelopmentPath={EXT_ROOT}', '--disable-workspace-trust',
         str(WORK), str(WORK / open_file)],
        env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, start_new_session=True)
    wait(20)  # window, extension activation, CodeLens resolution (generous: the Codespace CPU is shared)
    sh('xdotool', 'mousemove', '900', '700')


# --- capture --------------------------------------------------------------------------------------

def screenshot(path: Path) -> None:
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'x11grab', '-video_size', f'{SIZE[0]}x{SIZE[1]}',
                    '-i', DISPLAY, '-frames:v', '1', str(path)], check=True)


class Recording:
    """A take made of single-frame grabs, each one a short ffmpeg run, with the time it was taken.

    Not one continuous `ffmpeg -f x11grab`: on this Codespace a continuous grab made VS Code kill the window
    it was filming within seconds ("renderer process gone, killed, 15" — reproduced with and without
    `--disable-dev-shm-usage`, cursor drawing, a lower frame rate), while one-frame grabs never did. The
    result is ~3-5 frames per second, each shown for as long as it really lasted: enough for clicks, menus
    and notifications.
    """

    def __init__(self, frames_dir: Path):
        self.dir = frames_dir
        self.times: list[float] = []
        self._stop = False
        self._thread = None

    def _loop(self) -> None:
        while not self._stop:
            try:
                screenshot(self.dir / f'f{len(self.times):04d}.png')
            except subprocess.CalledProcessError as err:  # one lost frame is fine; say so and carry on
                print(f'frame grab failed: {err}', file=sys.stderr)
                continue
            self.times.append(time.monotonic())

    def start(self) -> None:
        import threading
        shutil.rmtree(self.dir, ignore_errors=True)
        self.dir.mkdir(parents=True)
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        wait(0.8)  # a still beat before the first action

    def stop(self) -> None:
        wait(0.5)
        self._stop = True
        assert self._thread
        self._thread.join(timeout=30)

    def concat_list(self) -> Path:
        """ffmpeg concat-demuxer list giving each frame its real duration."""
        lines = []
        for i, t in enumerate(self.times):
            nxt = self.times[i + 1] if i + 1 < len(self.times) else t + 1.5  # hold the last frame
            lines += [f"file '{self.dir / f'f{i:04d}.png'}'", f'duration {nxt - t:.3f}']
        lines.append(f"file '{self.dir / f'f{len(self.times) - 1:04d}.png'}'")
        listing = self.dir / 'frames.txt'
        listing.write_text('\n'.join(lines) + '\n')
        return listing


def window_died() -> bool:
    """VS Code logs this when the recorded window was killed: a GIF of it would show a crash dialog."""
    return any('renderer process gone' in log.read_text(errors='replace') for log in (PROFILE / 'user' / 'logs').glob('*/main.log'))


def to_gif(listing: Path, gif: Path, width: int = 960, fps: int = 10) -> None:
    flt = f'fps={fps},scale={width}:-1:flags=lanczos'
    palette_png = listing.with_suffix('.palette.png')
    source = ['-f', 'concat', '-safe', '0', '-i', str(listing)]
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *source, '-vf', f'{flt},palettegen=stats_mode=diff',
                    str(palette_png)], check=True)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *source, '-i', str(palette_png), '-lavfi',
                    f'{flt}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle', str(gif)], check=True)


# --- scenarios ------------------------------------------------------------------------------------
# Positions: 1280x800 window, SETTINGS above, docs/demo-workflow.md open (lens lines at y=100/157/314/531).

TOP_WORD = (475, 100)
TOP_PPTX = (630, 100)
TOP_SETTINGS = (745, 100)
BLOCK1_EXPORT = (668, 157)
BLOCK2_FENCE = (470, 332)
PICK_PPTX = (470, 76)  # 'PowerPoint (.pptx), one slide' in the Word/PowerPoint picker


def toast_pause() -> None:
    wait(6)  # export (Pandoc for Word) and the success notification


def sc_vscode() -> None:
    """Know what each diagram becomes, then export the document to Word."""
    move(560, 157, duration=0.8)
    wait(1.0)
    move(700, 314, duration=0.8)
    wait(1.0)
    move(520, 531, duration=0.8)
    wait(1.0)
    click(*TOP_WORD)
    toast_pause()


def sc_hover() -> None:
    """Hover a diagram's ```mermaid line: what it becomes in Word, and why."""
    move(*BLOCK2_FENCE, duration=0.8)
    wait(4.5)


def sc_pptx() -> None:
    """Export the document to PowerPoint, one slide per diagram."""
    click(*TOP_PPTX)
    wait(5)


def sc_diagram() -> None:
    """Export one diagram on its own, here as a one-slide deck."""
    click(*BLOCK1_EXPORT)
    wait(1.5)
    click(*PICK_PPTX)
    wait(5)


def sc_context_menu() -> None:
    """Right-click the file in the Explorer: md2nativedocx > Export to Word."""
    click(167, 150, button=3)
    wait(1.2)
    move(*CONTEXT_SUBMENU)
    wait(1.2)
    move(CONTEXT_WORD[0], CONTEXT_SUBMENU[1], duration=0.3)
    click(*CONTEXT_WORD)
    toast_pause()


CONTEXT_SUBMENU = (248, 523)
CONTEXT_WORD = (600, 523)


def sc_no_diagram() -> None:
    """A Markdown file with no diagram exports to Word the same way."""
    click(*TOP_WORD)
    toast_pause()


def sc_raw_mmd() -> None:
    """A bare .mmd file: what it becomes, then Export to Word."""
    move(560, 100, duration=0.8)
    wait(1.2)
    click(*RAW_WORD)
    toast_pause()


RAW_WORD = (475, 100)

SCENARIOS = {
    # name: (file opened, steps, output GIF)
    'vscode': ('demo-workflow.md', sc_vscode, 'demo-vscode.gif'),
    'hover': ('demo-workflow.md', sc_hover, 'demo-hover.gif'),
    'pptx': ('demo-workflow.md', sc_pptx, 'demo-powerpoint.gif'),
    'diagram': ('demo-workflow.md', sc_diagram, 'demo-diagram.gif'),
    'context-menu': ('demo-workflow.md', sc_context_menu, 'demo-context-menu.gif'),
    'no-diagram': ('demo-no-diagram.md', sc_no_diagram, 'demo-no-diagram.gif'),
    'raw-mmd': ('demo-raw.mmd', sc_raw_mmd, 'demo-raw-mmd.gif'),
}


def warm_pandoc_cache() -> None:
    """One unrecorded export, so the extension's pinned Pandoc is downloaded once and cached."""
    if STORAGE_CACHE.exists():
        return
    print('warming up: first export downloads Pandoc (not recorded)…')
    fresh_workspace()
    launch('demo-workflow.md')
    click(*TOP_WORD)
    for _ in range(180):
        if (WORK / 'demo-workflow.docx').exists():
            break
        wait(1)
    else:
        sys.exit('warm-up export did not finish in 3 minutes')
    shutil.copytree(PROFILE / STORAGE, STORAGE_CACHE)
    stop_vscode()


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    shots = '--shots' in sys.argv
    names = args or list(SCENARIOS)
    start_display()
    SHOTS.mkdir(exist_ok=True)
    try:
        warm_pandoc_cache()
        for name in names:
            open_file, steps, gif = SCENARIOS[name]
            fresh_workspace()
            launch(open_file)
            if shots:
                global wait
                real_wait = wait
                counter = iter(range(1000))

                def wait_and_shoot(seconds: float, _real=real_wait) -> None:
                    _real(seconds)
                    if seconds >= 1:
                        screenshot(SHOTS / f'{name}-{next(counter):02d}.png')

                wait = wait_and_shoot
                screenshot(SHOTS / f'{name}-start.png')
                steps()
                wait = real_wait
                print(f'{name}: shots in {SHOTS}')
                continue
            rec = Recording(SHOTS / f'{name}-frames')
            rec.start()
            steps()
            rec.stop()
            if window_died():
                sys.exit(f'{name}: the VS Code window died during the take (see {PROFILE}/user/logs) — nothing written. '
                         'The machine is probably too busy; retry this scenario alone.')
            to_gif(rec.concat_list(), DOCS / gif)
            print(f'{name}: {DOCS / gif} ({(DOCS / gif).stat().st_size // 1024} KB)')
    finally:
        stop_vscode()


if __name__ == '__main__':
    main()
