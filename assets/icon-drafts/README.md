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

No vector source ever existed for this concept (it started as AI-generated raster art), so a
vector "recreation" is always an interpretation, not an extraction — `icon-v4` sidesteps that by
staying raster but fixing the crop/transparency instead of re-guessing the internal shapes.

Decision needed before any of this ships: keep the current diamond+handles icon, or replace it
with a polished version of this concept (`icon-v3` refined against `icon-v4`'s measurements, or
`icon-v4` itself scaled up) — not made here.
