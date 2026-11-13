import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdmZip, readZipEntry, setZipEntry } from '../src/zipUtils.mjs';
import { classifyValidatorErrors, formatWordCompatibility } from '../src/wordCheck.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'bin', 'md2nativedocx.mjs');

const err = (Part, Path, Description = 'The element has unexpected child element x.') => ({ Part, Path, Description });

test('classify: own parts and drawing elements in document.xml are ours, never Pandoc noise', () => {
  const { own, pandoc, other } = classifyValidatorErrors([
    err('/word/diagrams/data1.xml', '/dgm:dataModel[1]'),
    err('/word/charts/chart1.xml', '/c:chartSpace[1]'),
    err('/word/document.xml', '/w:document[1]/w:body[1]/w:p[3]/w:r[1]/mc:AlternateContent[1]/mc:Choice[1]/w:drawing[1]/wp:inline[1]/a:graphic[1]'),
    err('/word/document.xml', '/w:document[1]/w:body[1]/w:p[3]/w:r[1]/w:drawing[1]/wp:anchor[1]/a:graphic[1]/a:graphicData[1]/wpc:wpc[1]/wps:wsp[2]'),
  ]);
  assert.equal(own.length, 4);
  assert.equal(pandoc.length + other.length, 0);
});

test('classify: the recorded Pandoc signatures are known, anything else is an error', () => {
  const { own, pandoc, other } = classifyValidatorErrors([
    err('/word/styles.xml', '/w:styles[1]/w:style[68]/w:rPr[1]'),
    err('/word/numbering.xml', '/w:numbering[1]/w:abstractNum[1]/w:nsid[1]', 'invalid value'),
    err('/word/settings.xml', '/w:settings[1]', "The element has unexpected child element '...:doNotTrackMoves'."),
    err('/word/document.xml', '/w:document[1]/w:body[1]/w:tbl[1]/w:tblPr[1]/w:jc[1]'),
    // Same part as a known signature, but a different shape: must not be swallowed.
    err('/word/settings.xml', '/w:settings[1]', "The element has unexpected child element '...:somethingElse'."),
    err('/word/styles.xml', '/w:styles[1]/w:docDefaults[1]'),
    err('/word/footer1.xml', '/w:ftr[1]'),
  ]);
  assert.equal(own.length, 0);
  assert.equal(pandoc.length, 4);
  assert.equal(other.length, 3);
});

test('format: says what was checked per part and never claims an effect on Word', () => {
  const clean = formatWordCompatibility({ ran: true, own: [], pandoc: [err('/word/numbering.xml', '/w:nsid[1]')], other: [] }).join('\n');
  assert.match(clean, /Diagrams and charts \(written by md2nativedocx\): no schema error found/);
  assert.match(clean, /1 known schema deviation\(s\) written by Pandoc itself/);
  assert.doesNotMatch(clean, /do not affect|without issue|will open/i);
  const bad = formatWordCompatibility({ ran: true, own: [err('/word/diagrams/x.xml', '/p')], pandoc: [], other: [err('/word/footer1.xml', '/q')] }).join('\n');
  assert.match(bad, /1 schema error\(s\):\n  - \/p/);
  assert.match(bad, /1 other schema error\(s\):[\s\S]*\/q/);
});

function haveDotnet() {
  try {
    execFileSync('dotnet', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// The blind spot named in the incident analysis: a broken `wpc` canvas inside word/document.xml used to
// land in the "elsewhere" bucket and the log still said "0 error(s)".
test('R1.4: a deliberately broken wpc canvas is reported as a diagram error', (t) => {
  if (!haveDotnet()) {
    t.skip('dotnet SDK not found on PATH');
    return;
  }
  const buildDir = mkdtempSync(join(tmpdir(), 'wc-build-'));
  const dir = mkdtempSync(join(tmpdir(), 'wc-'));
  try {
    execFileSync('dotnet', ['publish', join(here, '..', '..', '..', 'scripts', 'oxml-validator'), '--no-self-contained', '-c', 'Release', '-o', buildDir, '-p:UseAppHost=false'], { stdio: 'pipe' });
    const dll = join(buildDir, 'oxmlvalidator.dll');
    assert.ok(existsSync(dll));
    const env = { ...process.env, MD2NATIVEDOCX_ENABLE_SMARTART: '0', MD2NATIVEDOCX_OXML_VALIDATOR_DLL: dll };
    const md = join(dir, 'doc.md');
    const docx = join(dir, 'doc.docx');
    writeFileSync(md, '# T\n\n```mermaid\ngraph TD\n  A --> B\n  A --> C\n  B --> D\n  C --> D\n```\n');

    // Intact export first: the diagram part must be clean.
    let run = spawnSync('node', [cli, md, '-o', docx], { encoding: 'utf8', env });
    assert.equal(run.status, 0, run.stderr);
    assert.match(readFileSync(join(dir, 'doc.log'), 'utf8'), /Diagrams and charts \(written by md2nativedocx\): no schema error found/);

    // Now break the canvas: an element the schema does not allow inside wps:wsp.
    const zip = new AdmZip(docx);
    const xml = readZipEntry(zip, 'word/document.xml');
    assert.ok(xml.includes('<wps:wsp>'), 'the fixture must contain a wps shape');
    setZipEntry(zip, 'word/document.xml', xml.replace('<wps:wsp>', '<wps:wsp><wps:notAnElement/>'));
    const broken = join(dir, 'broken.docx');
    zip.writeZip(broken);
    // The validator exits non-zero when it finds errors; the JSON report is still on stdout.
    const out = spawnSync('dotnet', [dll, broken, '--json'], { encoding: 'utf8' }).stdout.trim().split('\n').pop();
    const { own } = classifyValidatorErrors(JSON.parse(out).errors);
    assert.ok(own.length > 0, 'a broken wpc canvas must be classified as our own output');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(buildDir, { recursive: true, force: true });
  }
});
