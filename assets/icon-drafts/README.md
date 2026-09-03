# Icon drafts — not shipped, research only

The extension's actual, shipped icon is [`packages/vscode-extension/icon.png`](../../packages/vscode-extension/icon.png)
(+ its `icon.svg` source) — a simple violet diamond with four corner "selection handle" squares.
Nothing in this folder replaces it; these are candidates from an unfinished rebrand exploration
towards a more literal "graph → text" concept (split diamond: node-graph on one half, paragraph
lines on the other).

| File | What it is |
|---|---|
| `logo-moodboard.jpg` | 15-tile AI-generated concept grid (raster only, no vector ground truth ever existed for any tile) — inspiration reference, not an asset. |
| `icon-v1-reference-crop.png` | One tile from the mood board, isolated. Low-res (201×181), non-square, opaque background (no real transparency) — not usable as-is. |
| `icon-v2.svg`, `icon-v3.svg` (+ preview PNGs) | Hand-authored vector redraws of the mood-board concept — hand-tuned/eyeballed coordinates, not measured against the reference crop. `icon-v3` is the closer match. |
| `icon-v4-from-png.png` | `icon-v1-reference-crop.png` re-cropped with the diamond's actual vertices measured programmatically (not eyeballed): tight, equalized, transparent margin instead of the opaque rectangle, square canvas. Keeps the source's real gradient/art instead of a hand-redrawn approximation. |
| `icon-v5-measured.svg` (+ `icon-v5-{16,32,128,256,512}.png`) | Vector redraw of `icon-v3`, this time with every internal position/size/color **measured** from the reference crop (pixel-color boundary scans for the diamond vertices, connected-component centroids for the circles/square/diamond/bars — see the tool session that produced this for the exact method). Found and fixed two real mistakes in `icon-v3`: the right half's fill/bar colors were inverted (v3: light fill + purple bars; reference: flat medium-purple fill + white bars), and the left-half graph shapes used the wrong color (v3: light lavender; reference: the same medium purple as the right half's fill). Closest match to the reference so far — current best candidate. |

No vector source ever existed for this concept (it started as AI-generated raster art), so a
vector "recreation" is always an interpretation, not an extraction — `icon-v4` sidesteps that by
staying raster; `icon-v5` measures the raster's actual geometry/colors instead of eyeballing them,
which is as close to "extraction" as this source allows.

At 16px the internal detail is illegible regardless of version (expected for any detailed icon at
that size — same would be true of the current shipped one if it had comparable detail); legible
from 32px up.

Decision needed before any of this ships: keep the current diamond+handles icon, or replace it
with `icon-v5` (or a further-refined pass on it) — not made here.
