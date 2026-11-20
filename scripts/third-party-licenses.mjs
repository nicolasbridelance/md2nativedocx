// License notices for the third-party code this project ships inside its own files: the esbuild bundles of
// the browser converter (packages/web) and of the VS Code extension, and the Open XML SDK DLLs the extension
// carries. The MIT, ISC and BSD licenses of that code ask for their notice to travel with every copy, and a
// minified bundle drops it, so each build writes the notices next to what it ships.
//
// The list is read from what the build really included (esbuild's metafile, the validator's deps.json), never
// kept by hand: a dependency added later gets its notice, or fails the build if its license is not one the
// project accepts. Packages published to npm are not concerned: npm installs each dependency with its own
// LICENSE file.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Licenses accepted for code shipped inside this project's own files (AGENTS.md rule 6, docs/compliance/legal.md). */
export const ALLOWED_LICENSES = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD']);

/** Raised when shipped code has a license outside {@link ALLOWED_LICENSES} or no notice to ship. */
export class ThirdPartyLicenseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ThirdPartyLicenseError';
  }
}

// The MIT license's own text, used only for a package that declares "MIT" but ships no LICENSE file.
const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.`;

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt))?$/i;

function authorOf(pkg) {
  const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
  return author ? author.replace(/\s*[<(].*$/, '').trim() : undefined;
}

/**
 * The npm packages an esbuild bundle contains, with their license text.
 * @param {{ inputs: Record<string, unknown> }} metafile esbuild's metafile (`metafile: true`)
 * @param {string} workingDir the directory esbuild resolved the metafile's paths from
 * @returns {Array<{ name: string, version: string, license: string, text: string }>} sorted by name
 */
export function npmPackagesInBundle(metafile, workingDir) {
  const dirs = new Set();
  for (const input of Object.keys(metafile.inputs)) {
    const match = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input.replace(/\\/g, '/'));
    if (match) dirs.add(resolve(workingDir, match[1]));
  }
  const packages = [];
  for (const dir of dirs) {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const license = typeof pkg.license === 'string' ? pkg.license : undefined;
    if (!license || !ALLOWED_LICENSES.has(license)) {
      throw new ThirdPartyLicenseError(`${pkg.name}@${pkg.version} is bundled but its license (${license ?? 'none declared'}) is not in ALLOWED_LICENSES`);
    }
    const file = readdirSync(dir).find((name) => LICENSE_FILE.test(name));
    let text;
    if (file) {
      text = readFileSync(join(dir, file), 'utf8').trim();
    } else if (license === 'MIT' && authorOf(pkg)) {
      text = `The package ships no license file; package.json declares "MIT", author ${authorOf(pkg)}.\n\nCopyright (c) ${authorOf(pkg)}\n\n${MIT_TEXT}`;
    } else {
      throw new ThirdPartyLicenseError(`${pkg.name}@${pkg.version} is bundled but ships no license file to copy`);
    }
    packages.push({ name: pkg.name, version: pkg.version, license, text });
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The NuGet packages a `dotnet publish` output depends on (its `*.deps.json`), with their license and
 * copyright read from each package's `.nuspec` in the local NuGet cache.
 * @param {string} depsJsonPath the published `<app>.deps.json`
 * @param {string} nugetRoot the NuGet global-packages folder (`dotnet nuget locals global-packages --list`)
 * @returns {Array<{ name: string, version: string, license: string, text: string }>}
 */
export function nugetPackagesOf(depsJsonPath, nugetRoot) {
  const deps = JSON.parse(readFileSync(depsJsonPath, 'utf8'));
  const packages = [];
  for (const [id, entry] of Object.entries(deps.libraries ?? {})) {
    if (entry.type !== 'package') continue;
    const [name, version] = id.split('/');
    const dir = join(nugetRoot, entry.path ?? `${name.toLowerCase()}/${version}`);
    const nuspec = readFileSync(join(dir, `${name.toLowerCase()}.nuspec`), 'utf8');
    const license = /<license type="expression">([^<]+)<\/license>/.exec(nuspec)?.[1];
    const copyright = /<copyright>([^<]+)<\/copyright>/.exec(nuspec)?.[1];
    if (!license || !ALLOWED_LICENSES.has(license)) {
      throw new ThirdPartyLicenseError(`${name} ${version} is shipped but its license (${license ?? 'none declared'}) is not in ALLOWED_LICENSES`);
    }
    if (license !== 'MIT' || !copyright) {
      throw new ThirdPartyLicenseError(`${name} ${version}: only an MIT package with a copyright line is handled (nuspec has ${license}, ${copyright ?? 'no copyright'})`);
    }
    let text = `${copyright}\n\n${MIT_TEXT}`;
    const notices = readdirSync(dir).find((file) => /^third-party-notices\.txt$/i.test(file));
    if (notices) text += `\n\nThird-party notices shipped with ${name}:\n\n${readFileSync(join(dir, notices), 'utf8').trim()}`;
    packages.push({ name, version, license, text });
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One plain-text notices file for a set of packages.
 * @param {string} intro what these files are and where they ship
 * @param {Array<{ name: string, version: string, license: string, text: string }>} packages
 */
export function renderNotices(intro, packages) {
  const rule = '-'.repeat(78);
  const sections = packages.map((p) => `${rule}\n${p.name} ${p.version} (${p.license})\n${rule}\n\n${p.text}\n`);
  return `${intro}\n\n${sections.join('\n')}`;
}
