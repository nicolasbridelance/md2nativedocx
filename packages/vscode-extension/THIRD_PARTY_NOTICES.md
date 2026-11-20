# Third-party notices

This extension's own code is CC0 1.0 Universal (see `LICENSE`). The `.vsix` package also contains
third-party libraries (bundled JavaScript, and the .NET libraries of the Word compatibility check)
and one file derived from Pandoc's templates. It downloads two third-party tools separately, never
bundled: Pandoc and the .NET runtime.

## Bundled libraries

All MIT-licensed. Their license texts ship inside the `.vsix`, in `dist/licenses/`, written at
build time from what the build actually bundled (`scripts/third-party-licenses.mjs` at the
repository root): a library whose license is not MIT, ISC, BSD or Apache-2.0, or that has no notice
to copy, fails the build.

| File in `dist/licenses/` | What it covers | Libraries |
|---|---|---|
| `vendor.txt` | the CLI and diagram engine bundled into `dist/vendor/` | `adm-zip` (writes the `.docx` zip entries), `dagre`, `graphlib`, `lodash` (diagram layout), `fast-xml-parser` and its dependencies `@nodable/entities`, `anynum`, `fast-xml-builder`, `is-unsafe`, `path-expression-matcher`, `strnum`, `xml-naming` (`.pptx` export) |
| `analysis.txt` | `dist/analysis.cjs`, the diagram analysis behind the CodeLens | `dagre`, `graphlib`, `lodash` |
| `oxml-validator.txt` | `dist/vendor/oxml-validator/`, the Word compatibility check | `DocumentFormat.OpenXml`, `DocumentFormat.OpenXml.Framework` (Microsoft's Open XML SDK), `System.IO.Packaging`, with the third-party notices `System.IO.Packaging` itself ships |

All are used as published upstream, unmodified.

## Pandoc's `opendocument` template (derived)

Shipped as `dist/vendor/assets/md2nativedocx.opendocument`, used for the `.odt` export.


Derived from Pandoc's `opendocument` template (Pandoc 3.1.3, `data/templates/default.opendocument`).
Pandoc's templates are dual-licensed under the GNU GPL (version 2 or later) and the BSD 3-Clause
license; this derived file is distributed under the BSD 3-Clause license. The only change is a loop
added inside `office:automatic-styles`, filled by this project's Lua filter with the styles of the
diagrams it draws. That change is distributed under the same license.

```
Copyright (c) 2014-2023, John MacFarlane <jgm@berkeley.edu>
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted
provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice, this list of conditions
    and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice, this list of
    conditions and the following disclaimer in the documentation and/or other materials provided
    with the distribution.
  * Neither the name of John MacFarlane nor the names of other contributors may be used to endorse
    or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Pandoc

- **What**: [Pandoc](https://pandoc.org) 3.1.3, © John MacFarlane.
- **License**: GNU General Public License, version 2 or later (GPL-2.0-or-later). Full text below.
- **How it's used**: this extension never bundles a Pandoc binary inside the `.vsix`. On first
  export, if Pandoc isn't already installed and on `PATH`, the extension downloads Pandoc's
  official, unmodified release binary directly from its GitHub Releases page
  (`https://github.com/jgm/pandoc/releases/download/3.1.3/<asset>`), verifies it against a
  SHA-256 checksum pinned in `src/pandocProvisioner.ts`, and caches it outside the extension
  (survives extension updates). Pandoc is always invoked as a separate subprocess — never linked
  into this extension's own code — matching the arm's-length invocation this project has always
  used for Pandoc (see `AGENTS.md` → Licensing).
- **Source**: the exact source corresponding to the binary fetched is
  <https://github.com/jgm/pandoc/tree/3.1.3>.
- **Modifications**: none — the binary is used exactly as published upstream.

### GPL-2.0-or-later license text

Pandoc's `COPYING.md` (<https://github.com/jgm/pandoc/blob/3.1.3/COPYING.md>) states Pandoc is
released under the GPL, version 2 or later. Verbatim text of GPL version 2:

> GNU GENERAL PUBLIC LICENSE
>
> Version 2, June 1991
>
> Copyright (C) 1989, 1991 Free Software Foundation, Inc.
> 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA
>
> Everyone is permitted to copy and distribute verbatim copies of this license document, but
> changing it is not allowed.

The complete, unmodified license text (preamble, all 12 numbered terms, and "How to Apply These
Terms to Your New Programs") is available at <https://www.gnu.org/licenses/old-licenses/gpl-2.0.html>
and at <https://github.com/jgm/pandoc/blob/3.1.3/COPYING.md>.

## .NET runtime

- **What**: the Microsoft .NET runtime (not the SDK), version pinned in `src/dotnetProvisioner.ts`
  (`DOTNET_RUNTIME_VERSION`), © .NET Foundation and Contributors.
- **License**: MIT. The downloaded archive carries its own `LICENSE.txt` and
  `ThirdPartyNotices.txt`, kept with it.
- **How it's used**: the Word compatibility check (`md2nativedocx.wordCompatibilityCheck.enabled`,
  on by default) runs `dist/vendor/oxml-validator/oxmlvalidator.dll` on the exported `.docx`. If no
  `dotnet` is on `PATH`, the extension downloads Microsoft's official runtime archive for the
  platform once from `builds.dotnet.microsoft.com`, verifies it against the SHA-512 Microsoft
  publishes, and caches it outside the extension, like Pandoc. Never bundled in the `.vsix`.
- **Modifications**: none.
