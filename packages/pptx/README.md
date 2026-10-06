# @md2nativedocx/pptx

The `.pptx` side of `md2nativedocx` (Markdown → native Word/PowerPoint, Mermaid diagrams included): Markdown with Mermaid diagrams → `.pptx`, **one 16:9 slide per ```` ```mermaid ```` block**, with native,
individually editable PowerPoint/Google Slides shapes (no pictures).

```bash
npx md2nativedocx deck.md -o deck.pptx
```

- A slide is titled with the nearest preceding Markdown heading.
- Text outside Mermaid blocks (prose, lists, tables) is **not** exported (docs/specs/cahier_des_charges_google_slides.md §5).
- All diagram types supported by the core are supported: the package does not translate diagrams itself,
  it rewrites the DrawingML shapes `@md2nativedocx/core` already emits (`wps:wsp` → `p:sp`/`p:cxnSp`,
  `w:p` text → `a:p`), enlarging them to fill the slide. See `docs/adr/0010-pptx-production-translator-plan.md`.
- SmartArt is `.docx`-only; the deck always uses plain shapes.
- Not verified yet in real PowerPoint / Google Slides — only LibreOffice Impress rendering and Open XML SDK
  schema validation (`npm run test:oxml-validate`).

Security: generated XML text stays XML-escaped end to end; DTD/entity declarations are rejected before parsing
and entity processing is off (AGENTS.md rule 5); the package never writes an external relationship (rule 3).
Dependencies: `fast-xml-parser` (MIT) to rewrite the shape tree, `adm-zip` (already used by the CLI) to write the OPC zip.
