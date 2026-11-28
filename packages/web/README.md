# md2nativedocx in the browser

A static page that converts Markdown with Mermaid and PlantUML diagrams to a Word document with
editable diagrams, entirely in the visitor's browser: <https://nicolasbridelance.github.io/md2nativedocx/>.
Nothing is sent to a server. Private package, published as a site by `.github/workflows/pages.yml`, not
on npm.

## How it works

1. A Web Worker (`src/worker.mjs`) downloads Pandoc's official `pandoc.wasm` (62.5 MB, about 17 MB
   compressed), checks its SHA-256 (`src/pandoc-release.mjs`), keeps it in the browser's Cache Storage,
   compiles it and starts it on this project's own in-memory WASI host (`src/wasi.mjs`,
   `src/pandoc-wasm.mjs`). The page (`src/main.mjs`) only shows what is happening, so it never freezes.
2. A conversion (`src/engine.mjs`) runs Pandoc twice: Markdown to its JSON AST, then the AST to
   `.docx`. In between, each diagram block is rendered by `renderDiagram()` from `@md2nativedocx/core`
   (`src/diagram-blocks.mjs`, the browser counterpart of the Lua filter, which cannot call the core here
   since `pandoc.wasm` runs no system command).
3. The CLI's own post-processing steps (`packages/cli/src/postprocess.mjs`, `chartParts.mjs`) run on
   the archive in memory, through this package's ZIP reader/writer on the browser's deflate
   (`src/zip.mjs`).

Same output as the CLI (AGENTS.md rule 7 holds: Pandoc writes the package), except what needs a file
system or environment variables: no images from the Markdown, no page or typography options yet, no
landscape tables, no `.odt` or `.pptx`.

## Commands

```bash
npm run build -w packages/core          # the core first
npm run build:site -w packages/web      # dist/: page, bundles, reference.docx, og-image.png, sitemap.xml, the IndexNow key file, pandoc/ (downloads Pandoc once into .cache/)
npm test -w packages/web                # unit tests: ZIP, WASI host, diagram blocks
npm run smoke -w packages/web           # a real conversion with pandoc.wasm under Node (Node 24+)
```

To try the site locally, serve `dist/` with any static server on `localhost` (the worker and the cache
need an HTTP origin, not `file://`).

## Changing the Pandoc version

Change the four values in `src/pandoc-release.mjs` together (the release asset's URL and SHA-256, the
SHA-256 and size of `pandoc.wasm` inside it), delete `.cache/`, then run `build:site` and `smoke`. The
CLI's CI pins its own Pandoc version separately (`.github/workflows/ci.yml`).

## Licenses

This package is CC0, like the rest of the project. `pandoc.wasm` is GPL-2.0-or-later: the site serves
it unmodified, with its `COPYING.md`, `COPYRIGHT` and the source of the same release next to it
(`docs/compliance/legal.md`, *The Pandoc case*).
