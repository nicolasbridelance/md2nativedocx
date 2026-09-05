import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, createReadStream, createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Auto-provisions the **.NET runtime** (not the SDK) for
 * `scripts/oxml-validator/`'s bundled DLL (`md2nativedocx.wordCompatibilityCheck.enabled`,
 * ADR 0007 part D) — same `ensurePandoc`/`PANDOC_MANIFEST` pattern as
 * `pandocProvisioner.ts`, deliberately: prefer whatever is already on `PATH`,
 * otherwise download the official Microsoft release for this platform once,
 * verify it against a pinned hash, cache it outside the extension.
 *
 * Two structural differences from `pandocProvisioner.ts`, both because a
 * .NET *runtime* is not a single relocatable binary the way the Pandoc
 * binary is:
 *  1. The whole extracted archive (confirmed by inspecting a real download:
 *     a flat `./dotnet` host executable alongside `./host/` and `./shared/`
 *     directories, no version-prefixed subdirectory like Pandoc's tarball)
 *     must be kept together — `dotnet` cannot run without its sibling
 *     `shared/Microsoft.NETCore.App/<version>/` directory next to it, so
 *     this provisions the *directory*, not one file copied out of it.
 *  2. Microsoft's own release manifest (`dotnet/core`'s `releases.json`,
 *     read directly to source these entries — never fabricated) publishes
 *     **SHA-512** hashes, not SHA-256; verified directly against a real
 *     download during implementation (`sha512sum` matched exactly).
 *
 * Deliberately NOT auto-provisioning the SDK: only the *runtime* is needed
 * to execute our own DLL (`dotnet <ourDll>.dll ...`, framework-dependent —
 * see `scripts/bundle-oxml-validator.mjs`'s doc comment for why that's built
 * framework-dependent rather than self-contained). Building that DLL in the
 * first place needs the SDK, but only at package time (maintainer/CI
 * machine, see the `.devcontainer`/`ci.yml` PR), never on an end user's
 * machine.
 */
export interface DotnetPlatformSpec {
  /** Official Microsoft release asset URL for this platform (from
   * `dotnet/core`'s `release-notes/<channel>/releases.json`, the `runtime`
   * section's `files` array — read directly, not fabricated). */
  url: string;
  /** SHA-512 of the exact release asset, as published in the same manifest
   * entry — verified before the downloaded archive is ever extracted or
   * executed. */
  sha512: string;
}

/** Kept in sync with `.devcontainer/setup.sh`'s `DOTNET_SDK_VERSION` and
 * `ci.yml`'s `actions/setup-dotnet@v4` pin (that's the SDK; this is the
 * runtime version the SDK itself reports as its bundled runtime — resolving
 * a version drift between "SDK version" and "runtime version" is exactly
 * why this constant is sourced from the SDK release's own manifest entry,
 * not guessed as "same as the SDK version"). */
export const DOTNET_RUNTIME_VERSION = '10.0.4';

const RELEASE_BASE_URL = `https://builds.dotnet.microsoft.com/dotnet/Runtime/${DOTNET_RUNTIME_VERSION}/`;

export const DOTNET_RUNTIME_MANIFEST: Record<string, DotnetPlatformSpec> = {
  'linux-x64': {
    url: RELEASE_BASE_URL + `dotnet-runtime-${DOTNET_RUNTIME_VERSION}-linux-x64.tar.gz`,
    sha512:
      '2e2730ca465838f3655c8d0576a2477531a9c764329d9e3c88c8c8b87b2708f981819e939def8bec204b90e98654b3a0f6e47b816f44ebab95b30c5028060d6c',
  },
  'linux-arm64': {
    url: RELEASE_BASE_URL + `dotnet-runtime-${DOTNET_RUNTIME_VERSION}-linux-arm64.tar.gz`,
    sha512:
      '497b7d67747b218bc3821b9a791527f696622611a53b755bf2f2b95f53bae14e1e5d8cdd6c22543f3f2d76f5d18b3ac2303bc22351c8eb7008a941a7fd32d976',
  },
  'darwin-x64': {
    url: RELEASE_BASE_URL + `dotnet-runtime-${DOTNET_RUNTIME_VERSION}-osx-x64.tar.gz`,
    sha512:
      'e0aff567a9544961071011944b6ab4a5175c0836d654cd236f82cabfc0c4f1e9879d11d171ea8ed0b2eba7c9b588f8cef15cc736204f2ca5ca32744679469db8',
  },
  'darwin-arm64': {
    url: RELEASE_BASE_URL + `dotnet-runtime-${DOTNET_RUNTIME_VERSION}-osx-arm64.tar.gz`,
    sha512:
      '3c5ff21aeb0b00ed8881e4dff8f95d488832d2137e406b8f19bdb4a9044f7fc8acc2abbc23e57ed24101d7ce0f3426c3ecb953f68128d86a8d93998fbadf32f7',
  },
  'win32-x64': {
    url: RELEASE_BASE_URL + `dotnet-runtime-${DOTNET_RUNTIME_VERSION}-win-x64.zip`,
    sha512:
      'adedbe032b87ed354efd7fe2a540f37fce7cc0a8e5627156d9aea5b0495d3bb9281dfa41f3b210c08ead7e09ff556bc871c59729470b0758ad3b59ba985ea410',
  },
  // Unlike Pandoc (which has no native win32-arm64 build and falls back to
  // x64-under-emulation, see PANDOC_MANIFEST), .NET publishes a genuine
  // native win-arm64 runtime — used directly, no fallback needed.
  'win32-arm64': {
    url: RELEASE_BASE_URL + `dotnet-runtime-${DOTNET_RUNTIME_VERSION}-win-arm64.zip`,
    sha512:
      '7a716aa2ac2c7fa701cdb69d1be698abdbc9c77a090d85f40b85f7a41419b823f5163a1fde9947c4c166f874d7a910aea2a32bafc5135813c5a261b760011b98',
  },
};

export class DotnetProvisionError extends Error {}

export type DotnetProvisionProgress = { phase: 'downloading'; fraction: number } | { phase: 'extracting' };

/** `${process.platform}-${process.arch}`, or `null` if this exact pair has
 * no entry in {@link DOTNET_RUNTIME_MANIFEST} — callers should fall back to
 * requiring a system-installed `dotnet` (or skip the compatibility check
 * entirely) in that case. */
export function getDotnetPlatformKey(platform: string = process.platform, arch: string = process.arch): string | null {
  const key = `${platform}-${arch}`;
  return key in DOTNET_RUNTIME_MANIFEST ? key : null;
}

/** SHA-512 of a file's contents, as lowercase hex — same shape as
 * `pandocProvisioner.ts`'s `sha256File`, different algorithm because that's
 * what Microsoft's own manifest publishes (verified directly against a real
 * download: `sha512sum` matched the manifest entry exactly). */
export function sha512File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512');
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
        reject(new DotnetProvisionError(`${command} ${args.join(' ')} failed: ${stderr || err.message}`));
        return;
      }
      resolve();
    });
  });
}

function isDotnetOnPath(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('dotnet', ['--version'], (err) => resolve(!err));
  });
}

async function downloadFile(url: string, destPath: string, onFraction?: (fraction: number) => void): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new DotnetProvisionError(`Download failed: HTTP ${response.status} for ${url}`);
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

/** Resolved runtime path: the directory containing `dotnet`/`dotnet.exe`
 * (needed, not just the executable itself, since it must stay next to its
 * sibling `host/`/`shared/` directories — see the module doc comment). */
function dotnetHostExecutable(dir: string, platformKey: string): string {
  return join(dir, platformKey.startsWith('win32') ? 'dotnet.exe' : 'dotnet');
}

async function provisionForPlatform(
  cacheRootDir: string,
  platformKey: string,
  onProgress?: (event: DotnetProvisionProgress) => void,
): Promise<string> {
  const spec = DOTNET_RUNTIME_MANIFEST[platformKey];
  if (!spec) {
    throw new DotnetProvisionError(`No .NET runtime manifest entry for platform "${platformKey}".`);
  }
  const dir = join(cacheRootDir, 'dotnet-runtime', DOTNET_RUNTIME_VERSION, platformKey);
  const hostPath = dotnetHostExecutable(dir, platformKey);
  const sentinelPath = join(dir, '.verified');

  if (existsSync(hostPath) && existsSync(sentinelPath)) {
    return hostPath;
  }

  mkdirSync(dir, { recursive: true });
  const tmpRoot = mkdtempSync(join(tmpdir(), 'md2nativedocx-dotnet-'));
  try {
    const assetName = spec.url.split('/').pop() ?? 'dotnet-runtime-archive';
    const archivePath = join(tmpRoot, assetName);
    onProgress?.({ phase: 'downloading', fraction: 0 });
    await downloadFile(spec.url, archivePath, (fraction) => onProgress?.({ phase: 'downloading', fraction }));

    const actualHash = await sha512File(archivePath);
    if (actualHash !== spec.sha512) {
      throw new DotnetProvisionError(
        `Downloaded .NET runtime archive failed checksum verification (expected ${spec.sha512}, got ${actualHash}) — refusing to run it.`,
      );
    }

    onProgress?.({ phase: 'extracting' });
    // Extract directly into the final cache directory (not a scratch dir
    // copied from afterwards, unlike Pandoc): the whole tree is what's
    // needed at runtime, there is no single file to lift out of it.
    // `tar -xf` auto-detects the archive format (.tar.gz on Linux/macOS,
    // .zip on Windows), same cross-platform mechanism `pandocProvisioner.ts`
    // already relies on — no new dependency (AGENTS.md rule 6).
    await execFileP('tar', ['-xf', archivePath, '-C', dir]);

    if (!existsSync(hostPath)) {
      throw new DotnetProvisionError(`Extracted .NET runtime archive did not contain the expected host executable at ${hostPath}.`);
    }
    if (process.platform !== 'win32') {
      chmodSync(hostPath, 0o755);
    }
    writeFileSync(sentinelPath, actualHash);
    return hostPath;
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

let inFlight: Promise<string> | null = null;

/** Resolve a `dotnet` executable to invoke: prefer whatever is already on
 * `PATH` (zero network calls — the common case for a dev machine that
 * already has the SDK, or a Codespace once the `.devcontainer`/`ci.yml` PR
 * lands), otherwise download the official Microsoft runtime release for
 * this platform once and cache it outside the extension (survives extension
 * updates), verifying it against a pinned SHA-512 before it is ever
 * extracted or executed.
 *
 * Throws {@link DotnetProvisionError} on any failure (unsupported platform,
 * network error, checksum mismatch, ...) — callers (the Word-compatibility
 * check, ADR 0007 part D) must catch this and skip the check entirely
 * rather than treat a throw as fatal, same "never turn a successful export
 * into a reported failure" rule already applied to every other optional
 * check in this codebase (`readWarningCount`, `extractWarnings`, ...). */
export async function ensureDotnet(
  cacheRootDir: string,
  onProgress?: (event: DotnetProvisionProgress) => void,
): Promise<string> {
  if (await isDotnetOnPath()) {
    return 'dotnet';
  }

  const platformKey = getDotnetPlatformKey();
  if (!platformKey) {
    throw new DotnetProvisionError(`No bundled .NET runtime available for this platform (${process.platform}-${process.arch}).`);
  }

  if (!inFlight) {
    inFlight = provisionForPlatform(cacheRootDir, platformKey, onProgress).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
