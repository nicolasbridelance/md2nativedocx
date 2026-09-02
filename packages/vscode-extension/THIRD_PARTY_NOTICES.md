# Third-party notices

This extension's own code is CC0 1.0 Universal (see `LICENSE`). It automates the use of one
third-party tool that is **not** CC0 and is not distributed as part of the `.vsix` package:

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
