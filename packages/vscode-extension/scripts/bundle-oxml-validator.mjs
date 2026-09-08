#!/usr/bin/env node
/**
 * Vendors the Word-compatibility validator DLL into dist/vendor/oxml-validator/,
 * for packaging into the .vsix (ADR 0007 part D, `dotnetProvisioner.ts`'s doc
 * comment for the full architecture).
 *
 * Published **framework-dependent**, not self-contained: this project
 * auto-provisions the .NET *runtime* separately (`dotnetProvisioner.ts`,
 * mirroring how `pandocProvisioner.ts` auto-provisions Pandoc) specifically
 * so this DLL doesn't need to bundle its own copy of the runtime — a
 * self-contained publish would duplicate what the provisioner already
 * downloads once and shares across every diagram/every export.
 *
 * Requires the .NET SDK on the machine running `npm run package`/`publish`
 * (the maintainer's machine or CI, never an end user's) — see the
 * `.devcontainer`/`ci.yml` PR (ADR 0007 part C) for where that SDK comes
 * from in this project's own dev/release environment.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const extensionRoot = dirname(here);
const repoRoot = join(extensionRoot, '..', '..');
const validatorProject = join(repoRoot, 'scripts', 'oxml-validator');
const vendorDir = join(extensionRoot, 'dist', 'vendor', 'oxml-validator');
const cli = join(repoRoot, 'packages', 'cli', 'bin', 'md2nativedocx.mjs');

if (!existsSync(join(validatorProject, 'oxmlvalidator.csproj'))) {
  console.error(`Validator project not found at ${validatorProject}.`);
  process.exit(1);
}

try {
  execFileSync('dotnet', ['--version'], { stdio: 'pipe' });
} catch {
  console.error('The .NET SDK (dotnet) is required to bundle the Word-compatibility validator — see the .devcontainer/ci.yml PR (ADR 0007 part C).');
  process.exit(1);
}

rmSync(vendorDir, { recursive: true, force: true });
mkdirSync(vendorDir, { recursive: true });

execFileSync(
  'dotnet',
  [
    'publish',
    validatorProject,
    '--no-self-contained',
    '-c',
    'Release',
    '-o',
    vendorDir,
    // No native apphost stub: it's platform-specific (an ELF/Mach-O/PE
    // launcher for whichever OS built it), useless in a cross-platform
    // .vsix where every platform's provisioned runtime instead invokes
    // this DLL directly (`dotnet oxmlvalidator.dll ...`).
    '-p:UseAppHost=false',
  ],
  { stdio: 'inherit' },
);

const dllPath = join(vendorDir, 'oxmlvalidator.dll');
if (!existsSync(dllPath)) {
  console.error(`dotnet publish ran without error but did not produce ${dllPath}.`);
  console.error('Contents of vendor dir:', readdirSync(vendorDir));
  process.exit(1);
}

// Self-check: a broken publish (missing dependency DLL, wrong target
// framework) must fail this script, not surface later as a silent failure
// inside a packaged extension nobody rebuilds. Uses the SDK's own runtime
// (available on this build machine) — the *provisioned* runtime is what an
// end user's machine gets, tested separately by dotnetProvisioner.test.ts.
//
// The "known-good file" is generated fresh here via this project's own CLI
// rather than a committed fixture — two reasons, found 2026-09-08:
//   1. The original fixture (handmade_samples/cycle-simple.docx) is
//      deliberately gitignored (real Word-extracted SmartArt content,
//      licensing — see AGENTS.md "Licensing"), so it doesn't exist on a
//      fresh checkout at all; this script would fail on any CI runner or
//      any contributor who hadn't kept that local research file around.
//   2. Even a committed, self-generated fixture couldn't assert
//      `errorCount === 0` today: Pandoc's own reference.docx-derived parts
//      (styles.xml/numbering.xml/settings.xml) carry ~17 pre-existing
//      schema quirks on *every* export, already characterized as Pandoc's
//      own writer bug — tolerated by real Word, not this project's to fix
//      (see scripts/test-oxml-validate.mjs, the same reasoning applied
//      here). What this smoke test actually needs to guarantee is that the
//      validator DLL itself runs and correctly flags issues in *this
//      project's own* output — so it uses the same word/diagrams+wpc:wpc
//      classification test:oxml-validate already established, not a raw
//      errorCount.
const smokeWorkDir = mkdtempSync(join(tmpdir(), 'md2nativedocx-oxmlvalidator-smoke-'));
try {
  const smokeMd = join(smokeWorkDir, 'smoke.md');
  const smokeDocx = join(smokeWorkDir, 'smoke.docx');
  writeFileSync(smokeMd, '# Smoke\n\n```mermaid\ngraph TD\n  A --> B\n  B --> C\n  C --> A\n```\n');
  execFileSync('node', [cli, smokeMd, '-o', smokeDocx], { stdio: 'pipe' });

  // The validator exits non-zero whenever errorCount > 0 (expected here,
  // given the pre-existing Pandoc noise above) — it still prints the JSON
  // report on stdout either way, only a genuinely missing stdout means the
  // validator itself failed to run (same handling as test-oxml-validate.mjs).
  let smokeOutput;
  try {
    smokeOutput = execFileSync('dotnet', [dllPath, smokeDocx, '--json'], { encoding: 'utf8' });
  } catch (err) {
    smokeOutput = err.stdout?.toString();
    if (!smokeOutput) throw err;
  }
  const report = JSON.parse(smokeOutput.trim());
  const ownOutputErrors = report.errors.filter(
    (e) => e.Part?.startsWith('/word/diagrams/') || e.Path?.includes('wpc:wpc'),
  );
  if (ownOutputErrors.length > 0) {
    throw new Error(
      `Smoke test found ${ownOutputErrors.length} schema error(s) in this project's own diagram output: ${JSON.stringify(ownOutputErrors)}`,
    );
  }
} finally {
  rmSync(smokeWorkDir, { recursive: true, force: true });
}

console.log(`Vendored Word-compatibility validator ready: ${vendorDir}`);
