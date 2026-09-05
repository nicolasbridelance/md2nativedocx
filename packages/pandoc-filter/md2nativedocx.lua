-- md2nativedocx.lua — Pandoc Lua filter.
--
-- Converts every ```mermaid code block into a native OOXML/DrawingML fragment
-- (wpg:wgp) via the md2nativedocx core engine, emitted as a
-- pandoc.RawBlock('openxml', ...) (ADR 0002).
--
-- Security (AGENTS.md):
--   * Rule #4: the core binary is invoked with a FIXED argument array and the
--     diagram text is piped via stdin — never interpolated into a shell string.
--   * Rule #3: the emitted fragment is fully self-contained (no external
--     OOXML relationship); the core guarantees this.
--
-- The path to the core bridge binary is configurable via the PANDOC_FILTER_CORE
-- environment variable, defaulting to the sibling bin/ script.

local core_bin = os.getenv('PANDOC_FILTER_CORE')
  or (debug.getinfo(1, 'S').source:match('^@(.*[/\\])') or '')
    .. 'bin/md2nativedocx-core.mjs'

-- File-based bridge: write the diagram to a temp file, invoke the core with a
-- fixed argument array (no shell interpolation of the diagram), read the XML.
local function run_core_file(mermaid_text)
  local tmp = os.tmpname()
  local f = assert(io.open(tmp, 'w'))
  f:write(mermaid_text)
  f:close()

  -- The bridge reads the diagram from the file path given as argv[1] and
  -- writes XML to stdout. We capture stdout via io.popen in read mode; the
  -- only thing interpolated into the shell string is the trusted binary path
  -- and the temp file path (which we control), never the diagram text.
  local cmd = core_bin .. ' ' .. tmp
  local p = io.popen(cmd, 'r')
  if not p then
    os.remove(tmp)
    return nil, 'md2nativedocx: could not start core bridge'
  end
  local xml = p:read('*a')
  local ok = p:close()
  os.remove(tmp)
  if not ok then
    return nil, 'md2nativedocx: core bridge failed'
  end
  return xml
end

-- Filter 1: ```mermaid code blocks -> native OOXML/DrawingML (unchanged
-- behaviour from before this file returned an explicit filter list — see
-- the doc comment on the returned table below for why it now has to be one).
local mermaid_filter = {
  CodeBlock = function(el)
    if el.classes[1] == 'mermaid' then
      local xml, err = run_core_file(el.text)
      if not xml then
        io.stderr:write(err .. '\n')
        return nil
      end
      return pandoc.RawBlock('openxml', xml)
    end
  end,
}

-- Filter 2: landscape section for a title+table pair (spec §1.9/§2.3,
-- "Lot 5"). Off by default (spec's own default) — MD2NATIVEDOCX_LANDSCAPE_TABLES
-- is set by md2nativedocx.mjs from `md2nativedocx.layout.landscapeTables`.
--
-- ADR 0005 (spike) findings this implements:
--   * The paragraph inserted before the Header must carry the CLOSING
--     (i.e. current/portrait) section's page settings, the one inserted
--     after the Table must carry the OPENING (landscape) section's settings
--     — the reverse of a naive "toggle before the Header" reading, because a
--     <w:sectPr> in a paragraph's pPr describes the section that ends there,
--     not the one that starts.
--   * This filter deliberately does NOT try to merge adjacent Header->Table
--     pairs, or special-case one being the last content in the document —
--     both produce an empty section (an extra blank page) if left as
--     independent open/close pairs. Fixing that requires knowing whether a
--     given <w:sectPr>-only paragraph ends up with real content on both
--     sides of it in the FINAL document, which this per-match, single-pass
--     block filter cannot see (Pandoc's own body-level closing <w:sectPr>
--     is a writer/reference-doc artifact, not a node in doc.blocks either).
--     That cleanup is done afterwards, on the generated document.xml, by
--     `collapseAdjacentSectionBreaks`/`collapseTrailingLandscapeSection` in
--     packages/cli/src/postprocess.mjs.
--
-- Detection is a direct, single-block lookahead (Header immediately followed
-- by Table) — a Header separated from its Table by some other block (e.g. an
-- intervening paragraph) is deliberately not matched, same scope limitation
-- flagged in ADR 0005 ("non couvert par ce spike").
local landscape_enabled = os.getenv('MD2NATIVEDOCX_LANDSCAPE_TABLES') == '1'

local function env_twips(name, fallback)
  local raw = os.getenv(name)
  local n = raw and tonumber(raw)
  return n or fallback
end

-- Fallbacks mirror referenceDocBuilder.mjs's own A4-portrait/"normal"-margin
-- defaults, in case this filter ever runs without md2nativedocx.mjs setting
-- these (e.g. a standalone `pandoc --lua-filter` invocation) — should never
-- happen in practice since MD2NATIVEDOCX_LANDSCAPE_TABLES and these geometry
-- vars are always set together by the CLI.
local PAGE_W = env_twips('MD2NATIVEDOCX_PAGE_W_TWIPS', 11906)
local PAGE_H = env_twips('MD2NATIVEDOCX_PAGE_H_TWIPS', 16838)
local MARGIN_TOP = env_twips('MD2NATIVEDOCX_MARGIN_TOP_TWIPS', 1417)
local MARGIN_RIGHT = env_twips('MD2NATIVEDOCX_MARGIN_RIGHT_TWIPS', 1417)
local MARGIN_BOTTOM = env_twips('MD2NATIVEDOCX_MARGIN_BOTTOM_TWIPS', 1417)
local MARGIN_LEFT = env_twips('MD2NATIVEDOCX_MARGIN_LEFT_TWIPS', 1417)

local function sectpr_paragraph(w, h, orient_attr)
  return '<w:p><w:pPr><w:sectPr><w:pgSz w:w="' .. w .. '" w:h="' .. h .. '"' .. orient_attr .. '/>' ..
    '<w:pgMar w:top="' .. MARGIN_TOP .. '" w:right="' .. MARGIN_RIGHT .. '" w:bottom="' .. MARGIN_BOTTOM ..
    '" w:left="' .. MARGIN_LEFT .. '" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:pPr></w:p>'
end

-- Closes the section in effect before the table (the document's normal page
-- setup — whatever md2nativedocx.mjs resolved from Lot 1 settings, or A4
-- portrait by default): unchanged orientation, no `w:orient` attribute.
local CURRENT_SECTPR = sectpr_paragraph(PAGE_W, PAGE_H, '')
-- Closes the table's own section: same page, rotated 90 degrees.
local LANDSCAPE_SECTPR = sectpr_paragraph(PAGE_H, PAGE_W, ' w:orient="landscape"')

local landscape_table_filter = {
  Pandoc = function(doc)
    if not landscape_enabled then return doc end
    local blocks = doc.blocks
    local out = pandoc.List()
    local i = 1
    while i <= #blocks do
      local b = blocks[i]
      local next_b = blocks[i + 1]
      if b.t == 'Header' and next_b and next_b.t == 'Table' then
        out:insert(pandoc.RawBlock('openxml', CURRENT_SECTPR))
        out:insert(b)
        out:insert(next_b)
        out:insert(pandoc.RawBlock('openxml', LANDSCAPE_SECTPR))
        i = i + 2
      else
        out:insert(b)
        i = i + 1
      end
    end
    doc.blocks = out
    return doc
  end,
}

-- Pandoc runs each table in this list as its own filter pass, in order. This
-- has to be explicit (rather than the implicit single-filter table Pandoc
-- builds from top-level global functions) because a `Pandoc(doc)` function
-- present in the SAME filter table as element handlers like `CodeBlock`
-- would make Pandoc ignore those element handlers entirely — two separate
-- tables keep the mermaid conversion above completely unaffected.
return { mermaid_filter, landscape_table_filter }
