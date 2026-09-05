-- Spike : détection Header -> Table + insertion de sectPr de bascule paysage/portrait.
-- Objectif du spike : confirmer empiriquement le piège documenté dans
-- export_customization_SPEC.md §2.3 (le sectPr d'une section se code dans le DERNIER
-- paragraphe de la section qui SE TERMINE, pas en tête de la section qui commence).

local PORTRAIT_SECTPR = [[<w:p><w:pPr><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:pPr></w:p>]]

local LANDSCAPE_SECTPR = [[<w:p><w:pPr><w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:pPr></w:p>]]

function Pandoc(doc)
  local blocks = doc.blocks
  local out = pandoc.List()

  local i = 1
  while i <= #blocks do
    local b = blocks[i]

    if b.t == "Header" then
      -- lookahead: skip blocks with no rendered content (rare, defensive) to find a Table
      local j = i + 1
      while j <= #blocks and blocks[j].t ~= "Table" and blocks[j].t == "Null" do
        j = j + 1
      end
      if j <= #blocks and blocks[j].t == "Table" then
        -- close the PRECEDING (portrait) section right before the Header
        out:insert(pandoc.RawBlock("openxml", PORTRAIT_SECTPR))
        out:insert(b)
        -- copy through any skipped Null blocks, then the Table itself
        for k = i + 1, j do
          out:insert(blocks[k])
        end
        -- close the landscape section right after the Table
        out:insert(pandoc.RawBlock("openxml", LANDSCAPE_SECTPR))
        i = j + 1
        goto continue
      end
    end

    out:insert(b)
    i = i + 1
    ::continue::
  end

  doc.blocks = out
  return doc
end
