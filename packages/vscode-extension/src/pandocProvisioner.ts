import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

async function downloadFile(url: string, destPath: string, onFraction?: (fraction: number) => void): Promise<void> {
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

async function provisionForPlatform(
  cacheRootDir: string,
  platformKey: string,
  onProgress?: (event: PandocProvisionProgress) => void,
): Promise<string> {
  const spec = PANDOC_MANIFEST[platformKey];
  if (!spec) {
    throw new PandocProvisionError(`No Pandoc manifest entry for platform "${platformKey}".`);
  }
  const dir = join(cacheRootDir, 'pandoc', PANDOC_VERSION, platformKey);
  const binPath = join(dir, platformKey.startsWith('win32') ? 'pandoc.exe' : 'pandoc');
  const sentinelPath = join(dir, '.verified');

  if (existsSync(binPath) && existsSync(sentinelPath)) {
    return binPath;
  }

  mkdirSync(dir, { recursive: true });
  const tmpRoot = mkdtempSync(join(tmpdir(), 'md2nativedocx-pandoc-'));
  try {
    const archivePath = join(tmpRoot, spec.asset);
    onProgress?.({ phase: 'downloading', fraction: 0 });
    await downloadFile(RELEASE_BASE_URL + spec.asset, archivePath, (fraction) =>
      onProgress?.({ phase: 'downloading', fraction }),
    );

    const actualHash = await sha256File(archivePath);
    if (actualHash !== spec.sha256) {
      throw new PandocProvisionError(
        `Downloaded Pandoc archive failed checksum verification (expected ${spec.sha256}, got ${actualHash}) — refusing to run it.`,
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
    writeFileSync(sentinelPath, actualHash);
    return binPath;
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
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
): Promise<string> {
  if (await isPandocOnPath()) {
    return 'pandoc';
  }

  const platformKey = getPlatformKey();
  if (!platformKey) {
    throw new PandocProvisionError(`No bundled Pandoc available for this platform (${process.platform}-${process.arch}).`);
  }

  if (!inFlight) {
    inFlight = provisionForPlatform(cacheRootDir, platformKey, onProgress).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
