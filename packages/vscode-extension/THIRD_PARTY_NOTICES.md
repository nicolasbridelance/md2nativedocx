# Third-party notices

This extension's own code is CC0 1.0 Universal (see `LICENSE`). It bundles one third-party
library and one file derived from Pandoc's templates inside the `.vsix` package, and automates the
use of one third-party tool that is downloaded separately and never bundled:

## adm-zip

- **What**: [adm-zip](https://github.com/cthackers/adm-zip) 0.6.x, © 2012 Another-D-Mention
  Software and other contributors.
- **License**: MIT. Full text below.
- **How it's used**: bundled (via `esbuild`) directly into the vendored CLI shipped inside this
  `.vsix` (`packages/cli/src/zipUtils.mjs`), to patch a handful of entries inside the generated
  `.docx` (itself a zip archive) without shelling out to a `zip`/`unzip` binary — neither exists on
  stock Windows.
- **Modifications**: none — used as published upstream, unmodified.

### MIT license text

> MIT License
>
> Copyright (c) 2012 Another-D-Mention Software and other contributors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

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
