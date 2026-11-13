#!/usr/bin/env bash
# Spike S2: rebuild s2.odt from source.md. Usage: build.sh <output-dir>
# Derives the template and the reference document from Pandoc's own defaults at build time, so
# neither Pandoc file is copied into this repository.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$1"
mkdir -p "${out}/ref"

# 1. Pandoc's opendocument template, plus one variable inside <office:automatic-styles>.
pandoc -D opendocument \
  | sed 's|    \$automatic-styles\$|    $automatic-styles$\n$for(md2n-automatic-styles)$\n    $md2n-automatic-styles$\n$endfor$|' \
  > "${out}/md2n.opendocument"

# 2. Pandoc's reference.odt, plus one arrow marker in office:styles (markers cannot be automatic).
pandoc -o "${out}/ref.odt" --print-default-data-file reference.odt
(cd "${out}/ref" && unzip -o -q ../ref.odt)
sed -i 's|<office:styles>|<office:styles><draw:marker draw:name="md2nArrow" svg:viewBox="0 0 20 30" svg:d="M10 0l-10 30h20z"/>|' \
  "${out}/ref/styles.xml"
rm -f "${out}/ref-md2n.odt"
(cd "${out}/ref" && zip -q -X -0 ../ref-md2n.odt mimetype && zip -q -X -r ../ref-md2n.odt . -x mimetype)

# 3. The filter fills the variable; Pandoc writes the whole package.
pandoc "${here}/source.md" --lua-filter "${here}/styles-filter.lua" \
  --template "${out}/md2n.opendocument" --reference-doc "${out}/ref-md2n.odt" -o "${out}/s2.odt"
echo "${out}/s2.odt"
