/**
 * Replaces the diagram code blocks of a Pandoc JSON AST with the core's rendering, in place of the
 * Pandoc Lua filter the CLI runs (`packages/pandoc-filter/md2nativedocx.lua`): `pandoc.wasm` runs Lua
 * filters but no system command, so the filter cannot call the core from there.
 *
 * Which blocks, and the `@startuml` rule, are the Lua filter's `CodeBlock` handler: keep the two in step.
 */

/** Code block languages that hold a diagram. */
const DIAGRAM_LANGUAGES = new Set(['mermaid', 'plantuml', 'puml']);

/**
 * The diagram source of a code block, or `null` when the block is not a diagram. A ```plantuml block may
 * leave out `@startuml`/`@enduml` (GitLab and Kroki accept that); the core recognises PlantUML by that
 * header, so it is added.
 * @param {string | undefined} language The block's first class.
 * @param {string} text
 * @returns {string | null}
 */
export function diagramSource(language, text) {
  if (!language || !DIAGRAM_LANGUAGES.has(language)) return null;
  if (language !== 'mermaid' && !/^\s*@start/.test(text)) return `@startuml\n${text}\n@enduml`;
  return text;
}

/**
 * Walks a Pandoc AST (`pandoc -t json`) and replaces each diagram `CodeBlock` with whatever `render`
 * returns for it: a `RawBlock` in practice, or the block itself to leave it unchanged.
 *
 * @param {{ blocks: unknown[] }} ast Modified in place.
 * @param {(source: string, block: object) => object} render
 * @returns {number} How many diagram blocks were found.
 */
export function replaceDiagramBlocks(ast, render) {
  let found = 0;
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) node[i] = visit(node[i]);
      return node;
    }
    if (node === null || typeof node !== 'object') return node;
    if (node.t === 'CodeBlock' && Array.isArray(node.c)) {
      const [attr, text] = node.c;
      const classes = Array.isArray(attr) ? attr[1] : undefined;
      const source = typeof text === 'string' ? diagramSource(Array.isArray(classes) ? classes[0] : undefined, text) : null;
      if (source === null) return node;
      found += 1;
      return render(source, node);
    }
    for (const key of Object.keys(node)) node[key] = visit(node[key]);
    return node;
  };
  ast.blocks = visit(ast.blocks);
  return found;
}

/**
 * Counts the diagram blocks without changing anything (to show progress before rendering).
 * @param {{ blocks: unknown[] }} ast
 */
export function countDiagramBlocks(ast) {
  let count = 0;
  const visit = (node) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node !== null && typeof node === 'object') {
      if (node.t === 'CodeBlock' && Array.isArray(node.c)) {
        const [attr, text] = node.c;
        if (typeof text === 'string' && Array.isArray(attr) && diagramSource(attr[1]?.[0], text) !== null) count += 1;
        return;
      }
      Object.values(node).forEach(visit);
    }
  };
  visit(ast.blocks);
  return count;
}
