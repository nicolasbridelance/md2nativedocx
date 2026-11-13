-- Spike S2: the filter declares the graphic styles it needs through template metadata.
function Pandoc(doc)
  local styles = {
    '<style:style style:name="md2nA" style:family="graphic"><style:graphic-properties draw:fill="solid" draw:fill-color="#c8f7c5" svg:stroke-color="#1e7b1e" draw:auto-grow-height="false" draw:textarea-vertical-align="middle"/></style:style>',
    '<style:style style:name="md2nB" style:family="graphic"><style:graphic-properties draw:fill="solid" draw:fill-color="#f7d6c5" svg:stroke-color="#7b3b1e" draw:auto-grow-height="false" draw:textarea-vertical-align="middle"/></style:style>',
    '<style:style style:name="md2nE" style:family="graphic"><style:graphic-properties svg:stroke-color="#000000" draw:marker-end="md2nArrow" draw:marker-end-width="0.3cm"/></style:style>',
    '<style:style style:name="md2nP" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/></style:style>',
  }
  local list = {}
  for _, s in ipairs(styles) do list[#list + 1] = pandoc.MetaInlines({ pandoc.RawInline('opendocument', s) }) end
  doc.meta['md2n-automatic-styles'] = pandoc.MetaList(list)
  return doc
end
