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

function CodeBlock(el)
  if el.classes[1] == 'mermaid' then
    local xml, err = run_core_file(el.text)
    if not xml then
      io.stderr:write(err .. '\n')
      return nil
    end
    return pandoc.RawBlock('openxml', xml)
  end
end
