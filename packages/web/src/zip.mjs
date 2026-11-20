/**
 * ZIP reading and writing on the platform's own deflate (`CompressionStream` / `DecompressionStream`,
 * format `deflate-raw`), for the archives this converter handles itself: the `.docx` Pandoc just wrote,
 * the bundled `reference.docx`, and the small workbook behind a native chart. Never an archive from
 * outside (AGENTS.md, zip bomb row of the Security table).
 *
 * Kept to what those archives use: deflate or stored entries, no ZIP64, no encryption, no multi-disk.
 * Anything else is refused with an error rather than half-read. Format: PKWARE APPNOTE.TXT, sections
 * 4.3.7 (local file header), 4.3.12 (central directory header), 4.3.16 (end of central directory).
 */

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const FLAG_ENCRYPTED = 0x0001;
const FLAG_UTF8 = 0x0800;
/** 1980-01-01 00:00 in MS-DOS date format: a fixed time makes the output depend only on the content. */
const DOS_DATE = 0x0021;
const MAX_ENTRIES = 10_000;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (the ZIP polynomial) of `bytes`. @param {Uint8Array} bytes */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Runs `bytes` through a compression or decompression stream. */
async function transform(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export class ZipFormatError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(`not a supported zip archive: ${message}`);
    this.name = 'ZipFormatError';
  }
}

/**
 * @typedef {object} ZipEntry
 * @property {number} method
 * @property {number} crc
 * @property {Uint8Array} compressed The entry's bytes as stored in the archive.
 * @property {number} size Uncompressed size.
 * @property {Uint8Array | null} content The uncompressed bytes, once read or written.
 */

/**
 * Reads an archive and decompresses every entry, so the result can be read and changed synchronously
 * (the post-processing steps are synchronous). `toBytes()` writes it back: unchanged entries are copied
 * with their original compressed bytes, changed or new ones are deflated.
 *
 * @param {Uint8Array} bytes
 */
export async function openZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (at) => {
    if (at + 4 > bytes.length) throw new ZipFormatError('truncated');
    return view.getUint32(at, true);
  };
  const u16 = (at) => {
    if (at + 2 > bytes.length) throw new ZipFormatError('truncated');
    return view.getUint16(at, true);
  };

  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === SIG_END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipFormatError('no end of central directory');
  if (u16(end + 4) !== 0 || u16(end + 6) !== 0) throw new ZipFormatError('multi-disk archive');
  const count = u16(end + 10);
  if (count > MAX_ENTRIES) throw new ZipFormatError('too many entries');
  let at = u32(end + 16);

  /** @type {Map<string, ZipEntry>} */
  const entries = new Map();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let i = 0; i < count; i++) {
    if (u32(at) !== SIG_CENTRAL) throw new ZipFormatError('bad central directory');
    const flags = u16(at + 8);
    const method = u16(at + 10);
    const crc = u32(at + 16);
    const compressedSize = u32(at + 20);
    const size = u32(at + 24);
    const nameLength = u16(at + 28);
    const extraLength = u16(at + 30);
    const commentLength = u16(at + 32);
    const localAt = u32(at + 42);
    if (flags & FLAG_ENCRYPTED) throw new ZipFormatError('encrypted entry');
    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) throw new ZipFormatError(`compression method ${method}`);
    if (compressedSize === 0xffffffff || size === 0xffffffff || localAt === 0xffffffff) throw new ZipFormatError('ZIP64');
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (u32(localAt) !== SIG_LOCAL) throw new ZipFormatError(`bad local header for ${name}`);
    const dataAt = localAt + 30 + u16(localAt + 26) + u16(localAt + 28);
    if (dataAt + compressedSize > bytes.length) throw new ZipFormatError(`truncated entry ${name}`);
    entries.set(name, { method, crc, compressed: bytes.slice(dataAt, dataAt + compressedSize), size, content: null });
    at += 46 + nameLength + extraLength + commentLength;
  }

  for (const [name, entry] of entries) {
    const content = entry.method === METHOD_STORED ? entry.compressed : await transform(entry.compressed, new DecompressionStream('deflate-raw'));
    if (content.length !== entry.size || crc32(content) !== entry.crc) throw new ZipFormatError(`corrupt entry ${name}`);
    entry.content = content;
  }

  /** Names of the entries written since opening. */
  const changed = new Set();
  const encoder = new TextEncoder();

  /** @type {import('../../cli/src/docxPackage.mjs').DocxPackage} */
  const pkg = {
    names: () => [...entries.keys()],
    readText(name) {
      const entry = entries.get(name);
      if (!entry || !entry.content) throw new Error(`md2nativedocx: missing ${name} in the .docx archive`);
      return new TextDecoder().decode(entry.content);
    },
    write(name, content) {
      const data = typeof content === 'string' ? encoder.encode(content) : content;
      entries.set(name, { method: METHOD_DEFLATE, crc: crc32(data), compressed: new Uint8Array(0), size: data.length, content: data });
      changed.add(name);
    },
  };

  return {
    pkg,
    /**
     * An entry's uncompressed bytes, or `undefined`.
     * @param {string} name
     */
    bytes: (name) => entries.get(name)?.content ?? undefined,
    /** The archive with every change, as bytes. */
    async toBytes() {
      for (const name of changed) {
        const entry = /** @type {ZipEntry} */ (entries.get(name));
        entry.compressed = await transform(/** @type {Uint8Array} */ (entry.content), new CompressionStream('deflate-raw'));
      }
      changed.clear();
      return writeArchive([...entries].map(([name, e]) => ({ name, method: e.method, crc: e.crc, size: e.size, compressed: e.compressed })));
    },
  };
}

/**
 * An archive of stored (uncompressed) text entries, written synchronously: the workbook behind a native
 * chart, a few kilobytes. Matches the `ZipWriter` that `buildWorkbookXlsx` (packages/cli) expects.
 * @param {Array<[string, string]>} files
 * @returns {Uint8Array}
 */
export function storedZip(files) {
  const encoder = new TextEncoder();
  return writeArchive(
    files.map(([name, text]) => {
      const data = encoder.encode(text);
      return { name, method: METHOD_STORED, crc: crc32(data), size: data.length, compressed: data };
    }),
  );
}

/**
 * @param {Array<{ name: string, method: number, crc: number, size: number, compressed: Uint8Array }>} list
 * @returns {Uint8Array}
 */
function writeArchive(list) {
  const encoder = new TextEncoder();
  /** @type {Uint8Array[]} */
  const chunks = [];
  /** @type {Uint8Array[]} */
  const central = [];
  let offset = 0;
  for (const entry of list) {
    const name = encoder.encode(entry.name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, SIG_LOCAL, true);
    local.setUint16(4, 20, true); // version needed: 2.0 (deflate)
    local.setUint16(6, FLAG_UTF8, true);
    local.setUint16(8, entry.method, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, entry.crc, true);
    local.setUint32(18, entry.compressed.length, true);
    local.setUint32(22, entry.size, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, entry.compressed);

    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, SIG_CENTRAL, true);
    header.setUint16(4, 20, true); // version made by
    header.setUint16(6, 20, true); // version needed
    header.setUint16(8, FLAG_UTF8, true);
    header.setUint16(10, entry.method, true);
    header.setUint16(14, DOS_DATE, true);
    header.setUint32(16, entry.crc, true);
    header.setUint32(20, entry.compressed.length, true);
    header.setUint32(24, entry.size, true);
    header.setUint16(28, name.length, true);
    header.setUint32(42, offset, true);
    central.push(new Uint8Array(header.buffer), name);
    offset += 30 + name.length + entry.compressed.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, SIG_END, true);
  end.setUint16(8, list.length, true);
  end.setUint16(10, list.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const chunk of all) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
