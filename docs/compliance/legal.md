# Legal — licenses, dependencies, data flows

> This is not legal advice. It is a factual state of affairs on 2026-11-20, checkable with the files and
> commands given, meant to speed up a legal or procurement review.

## Code license

All code in this repository is published under **CC0 1.0 Universal**, public domain: the npm packages
(`@md2nativedocx/core`, `pandoc-filter`, `pptx`, `cli`, `mcp`), the VS Code extension and the browser
converter (`packages/web`). Full, unmodified legal text in [`LICENSE`](../../LICENSE) (exact copy of
<https://creativecommons.org/publicdomain/zero/1.0/legalcode>).

Practical consequence: no attribution required, no copyleft, no restriction on commercial use, no
royalty. CC0 is more permissive than MIT, which still asks for its notice to be kept.

One limit to know: CC0 §4a explicitly grants **no patent license**. Switching to a license with a patent
grant (Apache-2.0, for example) is deferred until an integrator actually needs it
([`AGENTS.md`](../../AGENTS.md) → *Licensing*). External contributions are accepted under the
[Developer Certificate of Origin](https://developercertificate.org/) (`Signed-off-by:` on every commit,
checked by CI), without a CLA.

## Third-party code, per distribution channel

What each channel actually contains or installs at run time, not the development tooling. Counts are
distinct packages, read from `package-lock.json` on 2026-11-20.

| Channel | Third-party code | Licenses |
|---|---|---|
| `@md2nativedocx/core`, `pandoc-filter` | `dagre`, `graphlib`, `lodash` (diagram layout) | 3 MIT |
| `@md2nativedocx/pptx`, `cli` | the above, `adm-zip` (zip entries of the `.docx`/`.pptx`), `fast-xml-parser` and its 7 small dependencies | 12 MIT |
| `@md2nativedocx/mcp` | the above, plus the official MCP SDK (`@modelcontextprotocol/sdk`) and `zod`, which bring 92 more | 94 MIT, 7 ISC, 2 BSD-3-Clause, 1 BSD-2-Clause (104 in all) |
| VS Code extension (`.vsix`) | the 12 MIT packages of the CLI, bundled; Microsoft's Open XML SDK (`DocumentFormat.OpenXml`, `.Framework`) and `System.IO.Packaging`, for the Word compatibility check; one file derived from a Pandoc template (BSD-3-Clause, see below) | MIT, BSD-3-Clause |
| Browser converter (page scripts) | `dagre`, `graphlib`, `lodash`, bundled | 3 MIT |

No library under a copyleft license (GPL, AGPL, LGPL) is included in any channel.

**Notices.** The npm packages are installed by npm with each dependency's own `LICENSE` file. Where this
project bundles third-party code into its own files, the build writes the notices next to it:
`dist/licenses/` inside the `.vsix`, and
[`THIRD_PARTY_NOTICES.txt`](https://nicolasbridelance.github.io/md2nativedocx/THIRD_PARTY_NOTICES.txt) on
the site, linked from the page footer. Those files are generated from what the build really bundled
(`scripts/third-party-licenses.mjs`), and the build fails if a bundled package has a license outside MIT,
ISC, BSD or Apache-2.0, or no notice to copy. The extension's
[`THIRD_PARTY_NOTICES.md`](../../packages/vscode-extension/THIRD_PARTY_NOTICES.md) summarizes them.

**The MCP server's larger tree** comes from the MCP SDK, which also implements HTTP transports (Express,
Hono). This server uses only the stdio transport and opens no network port, but those packages are
installed with the SDK.

**The template derived from Pandoc.** `.odt` export uses a copy of Pandoc's `opendocument` template with
one loop added. Pandoc's templates are dual-licensed GPL-2.0-or-later or BSD-3-Clause; this file is
distributed under BSD-3-Clause, with its notice in the extension's `THIRD_PARTY_NOTICES.md`.

## The Pandoc case (GPL-2.0-or-later)

The tool delegates to [Pandoc](https://pandoc.org) everything that is not diagram conversion: Markdown
parsing, tables, styles, writing the `.docx`/`.odt` package (see [`README.md`](../../README.md) → *How it
works*). Pandoc is distributed under GPL-2.0-or-later (from `jgm/pandoc`'s `COPYING.md`).

- **Never linked.** In the CLI, the MCP server and the extension, Pandoc is always run as a separate
  program (`execFile`/`spawn` with an argument array, never a shell string, [`AGENTS.md`](../../AGENTS.md)
  rule 4), never linked statically or dynamically into this project's code. Running a program at arm's
  length is generally understood not to put GPL obligations on the calling program; your own legal team
  should confirm it if your review needs certainty.
- **CLI, MCP server, libraries:** Pandoc must already be installed (≥ 3.1.3). They neither download nor
  distribute it.
- **VS Code extension:** if Pandoc is not on `PATH`, the extension downloads Pandoc's official, unmodified
  release binary from `jgm/pandoc`'s GitHub releases, checks it against a SHA-256 pinned in the code
  (`src/pandocProvisioner.ts`) and caches it outside the extension. It is never bundled in the `.vsix`. An
  organization can point the download at an internal mirror (`md2nativedocx.pandoc.downloadUrl`), which
  then requires the matching SHA-256. GPL text and source location in
  [`THIRD_PARTY_NOTICES.md`](../../packages/vscode-extension/THIRD_PARTY_NOTICES.md).
- **Browser converter (`packages/web`, GitHub Pages; maintainer decision 2026-11-20):** the site serves
  Pandoc's official, unmodified `pandoc.wasm` (the WebAssembly build Pandoc publishes with each release
  since 3.9), checked against a SHA-256 pinned in `packages/web/src/pandoc-release.mjs` at build time and
  again by the page before it runs. Here the project **does distribute** the Pandoc binary. GPL-2.0
  section 3 is met by offering the source from the same place: the site serves `pandoc/COPYING.md`,
  `pandoc/COPYRIGHT` and the source archive of that exact release
  (`pandoc/pandoc-<version>-source.tar.gz`) next to `pandoc/pandoc.wasm`, all linked from the page footer.
  `pandoc.wasm` stays a separate program: it runs in its own WebAssembly instance, and this project's code
  talks to it only through its published interface (a JSON options object and files in an in-memory file
  system), without modifying or linking it. Two points for a review that needs certainty: whether that
  boundary counts as "arm's length" in a browser the way a separate process does, and the sources of the
  Haskell libraries compiled into the binary, which are public on Hackage but not served by the site.

## The .NET runtime (VS Code extension only)

The extension checks each exported `.docx` against Microsoft's Open XML schema (setting
`md2nativedocx.wordCompatibilityCheck.enabled`, on by default). The check is this project's own small
program (`oxmlvalidator.dll`, CC0) built on the Open XML SDK (MIT), and needs the .NET runtime (MIT). If
no `dotnet` is on `PATH`, the extension downloads Microsoft's official runtime archive once from
`builds.dotnet.microsoft.com`, checks it against the SHA-512 Microsoft publishes, and caches it outside
the extension; an internal mirror can be set (`md2nativedocx.dotnet.downloadUrl`, hash required). The
archive keeps Microsoft's own `LICENSE.txt` and `ThirdPartyNotices.txt`. Turning the check off removes
this download.

## Data flows and privacy

**No telemetry, no analytics, no crash reporting** in any channel. Document content is never sent to a
service run by this project; there is none.

| Channel | Network activity |
|---|---|
| `core`, `pandoc-filter`, `pptx` | None |
| CLI | None from its own code. Pandoc, which it runs, downloads an image the Markdown references by URL (`![](https://…)`), as Pandoc always does. `--sandbox` (or `MD2NATIVEDOCX_SANDBOX=1`) stops Pandoc from reading any image, file or URL named in the Markdown |
| MCP server | None. It talks to the assistant over stdio and opens no port. Pandoc always runs in sandbox mode there, so a request cannot make it read a local file, fetch a URL or reach a network share |
| VS Code extension | On first need only: the Pandoc download and the .NET runtime download described above (both from the official publisher or your mirror, hash-checked). Opens `pandoc.org/installing.html` in the browser only if the user clicks that help link. Like the CLI, Pandoc downloads images the Markdown references by URL, unless `md2nativedocx.sandbox.enabled` is on |
| Browser converter | The page loads its own files from the same site (page, scripts, `reference.docx`, `pandoc.wasm`) and nothing else. Its Content-Security-Policy (`connect-src 'self'`, no third-party script, font or image) makes any other request impossible, so the Markdown typed or opened never leaves the browser. It keeps a draft and the chosen options in the browser's `localStorage`, and `pandoc.wasm` in its Cache Storage, on the visitor's device. GitHub, as host, receives the usual HTTP requests for those files ([GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) applies) |

Generated files are written where the user asks and nowhere else. The MCP server writes only `.docx`
files inside its configured root folder and never overwrites an existing file.

## Where to check for yourself

| Question | File or command |
|---|---|
| Project license, legal text | [`LICENSE`](../../LICENSE) |
| Licenses of an npm package's dependencies | In an empty folder: `npm install @md2nativedocx/mcp` (or `cli`), then any license scanner, for example `npx license-checker --summary` |
| Notices of bundled code | `dist/licenses/` in the `.vsix` (a zip file); `THIRD_PARTY_NOTICES.txt` on the site |
| Pandoc and .NET runtime notices (extension) | [`packages/vscode-extension/THIRD_PARTY_NOTICES.md`](../../packages/vscode-extension/THIRD_PARTY_NOTICES.md) |
| Pinned Pandoc release of the site, and its hash | [`packages/web/src/pandoc-release.mjs`](../../packages/web/src/pandoc-release.mjs) |
| Network calls in the code | `grep -rn -e "fetch(" -e "https.get(" -e "https.request(" -e "openExternal" packages/*/src` |
| The license decisions and their history | [`AGENTS.md`](../../AGENTS.md) → *Licensing* |
| Vulnerability reporting | [`SECURITY.md`](../../SECURITY.md) |
