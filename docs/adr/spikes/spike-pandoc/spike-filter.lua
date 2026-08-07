-- Phase 0 spike — validate Pandoc RawBlock('openxml', ...) with a complex
-- grouped DrawingML fragment (wpg:wgp).
--
-- This filter replaces every ```mermaid code block with a RawBlock('openxml')
-- containing a non-trivial wpg:wgp group: two shapes (a rect and a diamond),
-- a connector, and a text box — the kind of fragment the real translator will
-- emit. The goal is to prove Pandoc 3.1.3 passes such a fragment through into
-- the .docx without mangling it, and that the result opens in Word.
--
-- Run:
--   pandoc spike.md -o spike.docx --lua-filter=spike-filter.lua
--   unzip -p spike.docx word/document.xml | grep -c wpg:wgp

local function escape(s)
  s = s:gsub('&', '&amp;'):gsub('<', '&lt;'):gsub('>', '&gt;')
  s = s:gsub('"', '&quot;'):gsub("'", '&apos;')
  return s
end

-- A complex grouped DrawingML fragment: a wpg:wgp containing two shapes and a
-- connector, with a text box. All coordinates in EMU (px * 9525).
local function buildWgp()
  return [[
<wpg:wgp xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
         xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
         xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
         xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
         xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
         xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <wpg:cNvGrpSpPr/>
  <wpg:grpSpPr>
    <a:xfrm>
      <a:off x="0" y="0"/>
      <a:ext cx="1143000" cy="762000"/>
      <a:chOff x="0" y="0"/>
      <a:chExt cx="1143000" cy="762000"/>
    </a:xfrm>
  </wpg:grpSpPr>
  <wpg:wsp>
    <wps:cNvSpPr/>
    <wps:spPr>
      <a:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="457200" cy="304800"/>
      </a:xfrm>
      <a:prstGeom prst="rect">
        <a:avLst/>
      </a:prstGeom>
      <a:solidFill><a:srgbClr val="D9E2F3"/></a:solidFill>
      <a:ln w="12700"><a:solidFill><a:srgbClr val="2F5496"/></a:solidFill></a:ln>
    </wps:spPr>
    <wps:txbx>
      <w:txbxContent xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:p><w:r><w:t>Node A</w:t></w:r></w:p>
      </w:txbxContent>
    </wps:txbx>
    <wps:bodyPr/>
  </wpg:wsp>
  <wpg:wsp>
    <wps:cNvSpPr/>
    <wps:spPr>
      <a:xfrm>
        <a:off x="685800" y="0"/>
        <a:ext cx="457200" cy="304800"/>
      </a:xfrm>
      <a:prstGeom prst="diamond">
        <a:avLst/>
      </a:prstGeom>
      <a:solidFill><a:srgbClr val="FCE4D6"/></a:solidFill>
      <a:ln w="12700"><a:solidFill><a:srgbClr val="C55A11"/></a:solidFill></a:ln>
    </wps:spPr>
    <wps:txbx>
      <w:txbxContent xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:p><w:r><w:t>Decision</w:t></w:r></w:p>
      </w:txbxContent>
    </wps:txbx>
    <wps:bodyPr/>
  </wpg:wsp>
  <wpg:cxnSp>
    <wps:cNvCnPr/>
    <wps:spPr>
      <a:xfrm>
        <a:off x="457200" y="152400"/>
        <a:ext cx="228600" cy="0"/>
      </a:xfrm>
      <a:prstGeom prst="line">
        <a:avLst/>
      </a:prstGeom>
      <a:ln w="12700"><a:solidFill><a:srgbClr val="2F5496"/></a:solidFill></a:ln>
    </wps:spPr>
    <wps:style/>
    <wps:bodyPr/>
  </wpg:cxnSp>
</wpg:wgp>
]]
end

function CodeBlock(el)
  if el.classes[1] == 'mermaid' then
    local xml = buildWgp()
    return pandoc.RawBlock('openxml', xml)
  end
end
