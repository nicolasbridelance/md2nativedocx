import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** One entry per supported `${process.platform}-${process.arch}` pair. */
export interface PandocPlatformSpec {
  /** GitHub release asset filename for this platform. */
  asset: string;
  /** SHA-256 of the exact release asset, pinned by hand — verified before the
   * downloaded archive is ever extracted or executed. */
  sha256: string;
  /** Path to the `pandoc`/`pandoc.exe` binary inside the extracted archive. */
  binaryPathInArchive: string;
}

/** Kept in sync with `.devcontainer/setup.sh` and `.github/workflows/ci.yml`
 * (AGENTS.md: version drift between Codespaces/CI and what ships here would
 * mean bundled Pandoc behaves differently than what the golden/visual tests
 * validated). */
export const PANDOC_VERSION = '3.1.3';

const RELEASE_BASE_URL = `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/`;

const WIN32_X64_SPEC: PandocPlatformSpec = {
  asset: 'pandoc-3.1.3-windows-x86_64.zip',
  sha256: '9b2d439db3188a624d212e1c73462ebb97453427cb470dc08bb31bf128429337',
  binaryPathInArchive: 'pandoc-3.1.3/pandoc.exe',
};

export const PANDOC_MANIFEST: Record<string, PandocPlatformSpec> = {
  'linux-x64': {
    asset: 'pandoc-3.1.3-linux-amd64.tar.gz',
    sha256: '74bc434908e4d858b3edbfd6271d2e9e499477837e5df1d630df4e62f113803d',
    binaryPathInArchive: 'pandoc-3.1.3/bin/pandoc',
  },
  'linux-arm64': {
    asset: 'pandoc-3.1.3-linux-arm64.tar.gz',
    sha256: '8c57ceb8e948d264cdd1269f5141de966a1f93b1b5099e65cdb92a6fee31f161',
    binaryPathInArchive: 'pandoc-3.1.3/bin/pandoc',
  },
  'darwin-x64': {
    asset: 'pandoc-3.1.3-x86_64-macOS.zip',
    sha256: '58aa8227fcbd323ec41bde5e10808fcb3bef6cae6d05192c807aac6fd86a6cdf',
    binaryPathInArchive: 'pandoc-3.1.3-x86_64/bin/pandoc',
  },
  'darwin-arm64': {
    asset: 'pandoc-3.1.3-arm64-macOS.zip',
    sha256: 'dd33afe7445cf5fb95add881bd11b9dea8e586d6fb30fc3274617b313207f87e',
    binaryPathInArchive: 'pandoc-3.1.3-arm64/bin/pandoc',
  },
  'win32-x64': WIN32_X64_SPEC,
  // Windows on ARM64 runs x64 binaries transparently via emulation, and
  // Pandoc 3.1.3 has no native win32-arm64 release asset — reuse the x64 one.
  'win32-arm64': WIN32_X64_SPEC,
};

export class PandocProvisionError extends Error {}

export type PandocProvisionProgress = { phase: 'downloading'; fraction: number } | { phase: 'extracting' };

/** Lets an IT department mirror the Pandoc release internally
 * (`md2nativedocx.pandoc.downloadUrl`/`.sha256`) for a network that only
 * allows an internal allowlist — `github.com` may not be reachable at all.
 * The hash is still mandatory: this only relocates *where* the archive is
 * fetched from, never removes the integrity check on what gets extracted
 * and executed. Both fields must be provided together; `downloadUrl` must
 * be `https://` (never allow a downgrade to plaintext HTTP). */
export interface PandocDownloadOverride {
  downloadUrl: string;
  sha256: string;
}

/** `${process.platform}-${process.arch}`, or `null` if this exact pair has no
 * entry in {@link PANDOC_MANIFEST} — callers should fall back to requiring a
 * system-installed Pandoc in that case. */
export function getPlatformKey(platform: string = process.platform, arch: string = process.arch): string | null {
  const key = `${platform}-${arch}`;
  return key in PANDOC_MANIFEST ? key : null;
}

/** SHA-256 of a file's contents, as lowercase hex. */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function execFileP(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (err, _stdout, stderr) => {
      if (err) {
        reject(new PandocProvisionError(`${command} ${args.join(' ')} failed: ${stderr || err.message}`));
        return;
      }
      resolve();
    });
  });
}

function isPandocOnPath(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('pandoc', ['--version'], (err) => resolve(!err));
  });
}

async function downloadViaFetch(url: string, destPath: string, onFraction?: (fraction: number) => void): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new PandocProvisionError(`Download failed: HTTP ${response.status} for ${url}`);
  }
  const total = Number(response.headers.get('content-length') ?? 0);
  let received = 0;
  const fileStream = createWriteStream(destPath);
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      await new Promise<void>((resolve, reject) => {
        fileStream.write(value, (err) => (err ? reject(err) : resolve()));
      });
      if (total > 0) onFraction?.(received / total);
    }
  } finally {
    await new Promise<void>((resolve) => fileStream.end(resolve));
  }
}

/** Fallback for `downloadViaFetch`: Node's global `fetch` ignores
 * `HTTP_PROXY`/`HTTPS_PROXY` and the OS-level proxy configuration, which
 * breaks on a typical corporate network. `curl` (present natively on
 * Windows 10 1803+, macOS, and virtually every Linux distro — no new
 * dependency, same reasoning as the `tar` call above) reads the system
 * proxy and certificate store, so it succeeds in cases `fetch` can't. No
 * fine-grained progress in this path — only reported once curl finishes. */
async function downloadViaCurl(url: string, destPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile('curl', ['-fL', '--proto', '=https', '--tlsv1.2', '-o', destPath, url], (err, _stdout, stderr) => {
      if (err) {
        reject(new PandocProvisionError(`curl download failed for ${url}: ${stderr || err.message}`));
        return;
      }
      resolve();
    });
  });
}

async function downloadFile(url: string, destPath: string, onFraction?: (fraction: number) => void): Promise<void> {
  try {
    await downloadViaFetch(url, destPath, onFraction);
  } catch (fetchErr) {
    try {
      await downloadViaCurl(url, destPath);
    } catch (curlErr) {
      const fetchDetail = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      const curlDetail = curlErr instanceof Error ? curlErr.message : String(curlErr);
      throw new PandocProvisionError(
        `Download failed via fetch (${fetchDetail}) and via curl fallback (${curlDetail}) — ` +
          `this network may require a proxy. See md2nativedocx.pandoc.downloadUrl to point at an internal mirror.`,
      );
    }
  }
}

/** Platform keys whose cached binary was already re-verified once during
 * this VS Code session (module-level — an extension host process lives for
 * one session). A corporate EDR can quarantine/truncate a file *after* it
 * was written and verified (async scan-on-write), so trusting `existsSync`
 * forever would let a poisoned cache look "ready" until the export itself
 * fails with a confusing error. Re-hashing the ~140MB binary is cheap
 * relative to a whole VS Code session, but too slow to redo on every single
 * export — once per session is the same tradeoff the source report
 * recommended. */
const reverifiedThisSession = new Set<string>();

/** Drive a full download+verify+extract+cleanup provisioning cycle from the
 * unit tests with a mock archive and a failing `rmSync` (missing_pandoc_bugfix.md
 * §2/§9). Exported behind the public-API surface so the unit tests can reach
 * it, while {@link ensurePandoc} stays the only entry point callers use. */
export async function provisionForPlatform(
  cacheRootDir: string,
  platformKey: string,
  onProgress?: (event: PandocProvisionProgress) => void,
  override?: PandocDownloadOverride,
): Promise<string> {
  const spec = PANDOC_MANIFEST[platformKey];
  if (!spec) {
    throw new PandocProvisionError(`No Pandoc manifest entry for platform "${platformKey}".`);
  }
  if (override && !override.downloadUrl.startsWith('https://')) {
    throw new PandocProvisionError('md2nativedocx.pandoc.downloadUrl must start with "https://".');
  }
  const downloadUrl = override?.downloadUrl ?? RELEASE_BASE_URL + spec.asset;
  const expectedArchiveHash = override?.sha256 ?? spec.sha256;

  const dir = join(cacheRootDir, 'pandoc', PANDOC_VERSION, platformKey);
  const binPath = join(dir, platformKey.startsWith('win32') ? 'pandoc.exe' : 'pandoc');
  const sentinelPath = join(dir, '.verified');

  if (existsSync(binPath) && existsSync(sentinelPath)) {
    if (reverifiedThisSession.has(binPath) || (await isCachedBinaryIntact(binPath, sentinelPath))) {
      reverifiedThisSession.add(binPath);
      return binPath;
    }
    // Cache was tampered with, truncated, or quarantined after being
    // written — wipe it and fall through to a full, fresh provisioning
    // rather than surfacing a confusing failure at export time.
    rmSync(dir, { recursive: true, force: true });
  }

  mkdirSync(dir, { recursive: true });
  const tmpRoot = mkdtempSync(join(tmpdir(), 'md2nativedocx-pandoc-'));
  try {
    const archiveName = downloadUrl.split('/').pop() || spec.asset;
    const archivePath = join(tmpRoot, archiveName);
    onProgress?.({ phase: 'downloading', fraction: 0 });
    await downloadFile(downloadUrl, archivePath, (fraction) => onProgress?.({ phase: 'downloading', fraction }));

    const actualArchiveHash = await sha256File(archivePath);
    if (actualArchiveHash !== expectedArchiveHash) {
      throw new PandocProvisionError(
        `Downloaded Pandoc archive failed checksum verification (expected ${expectedArchiveHash}, got ${actualArchiveHash}) — refusing to run it.`,
      );
    }

    onProgress?.({ phase: 'extracting' });
    const extractDir = join(tmpRoot, 'extract');
    mkdirSync(extractDir, { recursive: true });
    // `tar -xf` auto-detects the archive format: GNU tar on Linux handles our
    // .tar.gz assets, and the bsdtar/libarchive-backed `tar` shipped on macOS
    // and Windows 10+ handles our .zip assets the same way — one command
    // across every supported platform, no new dependency (AGENTS.md rule 6).
    await execFileP('tar', ['-xf', archivePath, '-C', extractDir]);

    const extractedBin = join(extractDir, spec.binaryPathInArchive);
    if (!existsSync(extractedBin)) {
      throw new PandocProvisionError(
        `Extracted Pandoc archive did not contain the expected binary at ${spec.binaryPathInArchive}.`,
      );
    }
    copyFileSync(extractedBin, binPath);
    if (process.platform !== 'win32') {
      chmodSync(binPath, 0o755);
    }
    // The sentinel stores the hash of the *installed* binary (not the
    // archive above) so a later session can detect this exact file being
    // corrupted/replaced in place — see isCachedBinaryIntact.
    writeFileSync(sentinelPath, await sha256File(binPath));
    reverifiedThisSession.add(binPath);
    return binPath;
  } finally {
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup only: a transient lock on the temp dir (e.g. an
      // EDR/antivirus scanning the freshly-extracted binary) must never
      // undo a provisioning that already succeeded and was verified above —
      // `finally` re-throwing here would silently discard the `return`.
    }
  }
}

/** Cheap existence/size check always; a full re-hash against the sentinel
 * only the first time a given `binPath` is seen this session (see
 * {@link reverifiedThisSession}). Exported so the unit tests can exercise the
 * "cached binary corrupted/quarantined after write" path directly
 * (missing_pandoc_bugfix.md §9). */
export async function isCachedBinaryIntact(binPath: string, sentinelPath: string): Promise<boolean> {
  try {
    if (statSync(binPath).size === 0) return false;
    const expectedHash = readFileSync(sentinelPath, 'utf8').trim();
    const actualHash = await sha256File(binPath);
    return actualHash === expectedHash;
  } catch {
    return false;
  }
}

let inFlight: Promise<string> | null = null;

/** Resolve a Pandoc binary to invoke: prefer whatever is already on `PATH`
 * (matches today's behaviour, zero network calls), otherwise download the
 * official, unmodified Pandoc release for this platform once and cache it
 * outside the extension (survives extension updates), verifying it against a
 * pinned SHA-256 before it is ever extracted or executed.
 *
 * Throws {@link PandocProvisionError} on any failure (unsupported platform,
 * network error, checksum mismatch, ...) — callers should catch this and fall
 * back to the existing "Pandoc not found" flow rather than treat a throw as
 * fatal, so automatic setup failing never leaves the user worse off than
 * before it existed. */
export async function ensurePandoc(
  cacheRootDir: string,
  onProgress?: (event: PandocProvisionProgress) => void,
  override?: PandocDownloadOverride,
): Promise<string> {
  if (await isPandocOnPath()) {
    return 'pandoc';
  }

  const platformKey = getPlatformKey();
  if (!platformKey) {
    throw new PandocProvisionError(`No bundled Pandoc available for this platform (${process.platform}-${process.arch}).`);
  }

  if (!inFlight) {
    inFlight = provisionForPlatform(cacheRootDir, platformKey, onProgress, override).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
