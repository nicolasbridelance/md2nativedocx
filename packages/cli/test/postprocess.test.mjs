import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injectNamespaces, renumberDrawingIds } from '../src/postprocess.mjs';

/** A `w:document` root as Pandoc emits it: no wpc/wpg/wps declarations. */
const PANDOC_ROOT =
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
  ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"' +
  ' mc:Ignorable="w14 wp14">';

/** Build a minimal `w:drawing` block with the given ids. */
function drawing({ docPr, group, shapes, connector }) {
  return (
    '<w:drawing><wp:inline>' +
    `<wp:docPr id="${docPr}" name="Diagram"/>` +
    `<wpg:wgp><wpg:cNvPr id="${group}" name="Group"/>` +
    shapes.map((id) => `<wps:cNvPr id="${id}" name="Shape"/>`).join('') +
    `<wps:cNvPr id="${connector}" name="Connector"/>` +
    `<wps:cNvCnPr><a:stCxn id="${shapes[0]}" idx="3"/><a:endCxn id="${shapes[1]}" idx="1"/></wps:cNvCnPr>` +
    '</wpg:wgp></wp:inline></w:drawing>'
  );
}

test('injects the extended namespaces onto the document root', () => {
  const out = injectNamespaces(`${PANDOC_ROOT}<w:body/></w:document>`);
  const root = out.slice(0, out.indexOf('>') + 1);
  for (const prefix of ['wpc', 'wpg', 'wps', 'wp14']) {
    assert.ok(root.includes(`xmlns:${prefix}=`), `root is missing xmlns:${prefix}`);
  }
});

test('inline declarations in the body do not suppress the root injection', () => {
  // Regression: the check used to search the whole document, so the translator's
  // own inline `xmlns:wpg=` on `wpg:wgp` made it conclude the root was already
  // correct and skip it — the post-processing was a silent no-op.
  const body = '<w:body><wpg:wgp xmlns:wpg="urn:x" xmlns:wps="urn:y" xmlns:wpc="urn:z"/></w:body>';
  const out = injectNamespaces(`${PANDOC_ROOT}${body}</w:document>`);
  const root = out.slice(0, out.indexOf('>') + 1);
  assert.ok(root.includes('xmlns:wpg='));
  assert.ok(root.includes('xmlns:wps='));
  assert.ok(root.includes('xmlns:wpc='));
});

test('injection is idempotent', () => {
  const once = injectNamespaces(`${PANDOC_ROOT}<w:body/></w:document>`);
  assert.equal(injectNamespaces(once), once);
});

test('an existing mc:Ignorable is preserved', () => {
  const out = injectNamespaces(`${PANDOC_ROOT}<w:body/></w:document>`);
  assert.equal(out.match(/mc:Ignorable=/g).length, 1);
  assert.ok(out.includes('mc:Ignorable="w14 wp14"'));
});

test('rejects a document with no w:document root', () => {
  assert.throws(() => injectNamespaces('<not-a-document/>'), /w:document/);
});

test('renumbers ids so two diagrams never collide', () => {
  // Each fragment is numbered from 1 independently by the (pure) translator, so
  // an unpatched two-diagram document always collides and Word offers to repair.
  const xml =
    drawing({ docPr: 1, group: 2, shapes: [3, 4], connector: 5 }) +
    drawing({ docPr: 1, group: 2, shapes: [3, 4], connector: 5 });
  const out = renumberDrawingIds(xml);
  const ids = [...out.matchAll(/<(?:wp:docPr|wpg:cNvPr|wps:cNvPr)\s+id="(\d+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 10);
  assert.equal(new Set(ids).size, 10, `duplicate ids after renumbering: ${ids.join(',')}`);
});

test('renumbering keeps each connector attached to its own shapes', () => {
  const xml =
    drawing({ docPr: 1, group: 2, shapes: [3, 4], connector: 5 }) +
    drawing({ docPr: 1, group: 2, shapes: [3, 4], connector: 5 });
  const out = renumberDrawingIds(xml);
  for (const block of out.match(/<w:drawing>[\s\S]*?<\/w:drawing>/g)) {
    const defined = new Set([...block.matchAll(/<wps:cNvPr\s+id="(\d+)"/g)].map((m) => m[1]));
    const referenced = [...block.matchAll(/<a:(?:stCxn|endCxn)\s+id="(\d+)"/g)].map((m) => m[1]);
    assert.equal(referenced.length, 2);
    for (const ref of referenced) {
      assert.ok(defined.has(ref), `connector points outside its drawing: id ${ref}`);
    }
  }
  // The two connectors must not end up pointing at the same shapes.
  const refs = [...out.matchAll(/<a:stCxn\s+id="(\d+)"/g)].map((m) => m[1]);
  assert.notEqual(refs[0], refs[1]);
});

test('renumbering leaves a document with no drawings untouched', () => {
  const xml = '<w:body><w:p><w:r><w:t>plain</w:t></w:r></w:p></w:body>';
  assert.equal(renumberDrawingIds(xml), xml);
});
