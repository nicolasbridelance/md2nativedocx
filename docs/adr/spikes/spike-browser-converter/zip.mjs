// Spike: minimal ZIP read / rewrite on the browser's own deflate (CompressionStream 'deflate-raw').
// Reads every entry of an archive, lets the caller replace or add entries, writes a new archive.
// Unchanged entries are copied with their original compressed bytes. No ZIP64, no encryption:
// a Pandoc .docx never uses either.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

export async function readZip(buf) {
  const u8 = new Uint8Array(buf); const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip archive');
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const entries = new Map(); const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad central directory');
    const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const dataStart = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    entries.set(name, { method, crc, csize, usize, raw: u8.subarray(dataStart, dataStart + csize) });
    p += 46 + nlen + xlen + clen;
  }
  return {
    names: () => [...entries.keys()],
    async read(name) {
      const e = entries.get(name); if (!e) return undefined;
      return e.method === 0 ? e.raw : pipe(e.raw, new DecompressionStream('deflate-raw'));
    },
    async readText(name) { const b = await this.read(name); return b && new TextDecoder().decode(b); },
    async set(name, data) {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      entries.set(name, { method: 8, crc: crc32(bytes), csize: 0, usize: bytes.length, raw: await pipe(bytes, new CompressionStream('deflate-raw')) });
      entries.get(name).csize = entries.get(name).raw.length;
    },
    write() {
      const enc = new TextEncoder(); const chunks = []; const central = []; let offset = 0;
      for (const [name, e] of entries) {
        const n = enc.encode(name);
        const h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, e.method, true);
        h.setUint16(12, 0x21, true); // fixed DOS date 1980-01-01: deterministic output
        h.setUint32(14, e.crc, true); h.setUint32(18, e.csize, true); h.setUint32(22, e.usize, true); h.setUint16(26, n.length, true);
        chunks.push(new Uint8Array(h.buffer), n, e.raw);
        const c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(10, e.method, true);
        c.setUint16(14, 0x21, true); c.setUint32(16, e.crc, true); c.setUint32(20, e.csize, true); c.setUint32(24, e.usize, true);
        c.setUint16(28, n.length, true); c.setUint32(42, offset, true);
        central.push(new Uint8Array(c.buffer), n);
        offset += 30 + n.length + e.raw.length;
      }
      const cdSize = central.reduce((s, b) => s + b.length, 0);
      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.size, true); end.setUint16(10, entries.size, true);
      end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
      return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    },
  };
}
