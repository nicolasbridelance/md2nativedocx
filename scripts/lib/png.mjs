/**
 * Minimal PNG decoder and pixel-diff, sufficient for the one thing
 * `test:visual` needs: compare two same-size renders produced by LibreOffice's
 * `--convert-to png` (always 8-bit, non-interlaced RGB or RGBA). Not a
 * general-purpose PNG library — see AGENTS.md rule #6 (no new dependency
 * without justification): pulling in a package for that single comparison
 * isn't worth it when `node:zlib` already provides the one hard part
 * (DEFLATE).
 */

import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Split a PNG buffer into its chunks (type + data), signature already verified. */
function readChunks(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('not a PNG file');
  }
  const chunks = [];
  let offset = 8;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 8 + length + 4; // length + type + data + crc, in that order
  }
  return chunks;
}

/** The PNG "Paeth" filter predictor (spec §9.2). */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decode a PNG buffer into `{ width, height, channels, pixels }`, where
 * `pixels` is a flat `Uint8Array` of interleaved 8-bit channel values.
 * Only 8-bit depth, color type 2 (RGB) or 6 (RGBA), no interlacing — the
 * combination LibreOffice's PNG export always produces.
 */
export function decodePng(buf) {
  const chunks = readChunks(buf);
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('PNG missing IHDR chunk');
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data.readUInt8(8);
  const colorType = ihdr.data.readUInt8(9);
  const interlace = ihdr.data.readUInt8(12);
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(
      `unsupported PNG format (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}); ` +
        "this decoder only handles 8-bit non-interlaced RGB/RGBA, LibreOffice's own output format",
    );
  }
  const channels = colorType === 6 ? 4 : 3;

  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = inflateSync(idat);

  const stride = width * channels;
  const pixels = new Uint8Array(height * stride);
  let rawOffset = 0;
  let prevRow = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset++];
    const row = raw.subarray(rawOffset, rawOffset + stride);
    rawOffset += stride;
    const outRow = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? outRow[x - channels] : 0;
      const b = prevRow[x];
      const c = x >= channels ? prevRow[x - channels] : 0;
      let value = row[x];
      switch (filterType) {
        case 0:
          break;
        case 1:
          value = (value + a) & 0xff;
          break;
        case 2:
          value = (value + b) & 0xff;
          break;
        case 3:
          value = (value + Math.floor((a + b) / 2)) & 0xff;
          break;
        case 4:
          value = (value + paeth(a, b, c)) & 0xff;
          break;
        default:
          throw new Error(`unsupported PNG filter type ${filterType}`);
      }
      outRow[x] = value;
    }
    prevRow = outRow;
  }
  return { width, height, channels, pixels };
}

/**
 * Compare two decoded images pixel by pixel. A pixel counts as "different"
 * only once some channel's delta exceeds `channelTolerance` — this absorbs
 * anti-aliasing/font-hinting jitter between LibreOffice runs or versions
 * without masking an actual rendering change. Returns the fraction (0..1) of
 * differing pixels, or `equalDimensions: false` if the two images don't even
 * have the same size.
 */
export function diffImages(a, b, channelTolerance = 24) {
  if (a.width !== b.width || a.height !== b.height) {
    return { equalDimensions: false, diffFraction: 1 };
  }
  const channels = Math.min(a.channels, b.channels);
  const pixelCount = a.width * a.height;
  let diffPixels = 0;
  for (let p = 0; p < pixelCount; p++) {
    let differs = false;
    for (let ch = 0; ch < channels; ch++) {
      if (Math.abs(a.pixels[p * a.channels + ch] - b.pixels[p * b.channels + ch]) > channelTolerance) {
        differs = true;
        break;
      }
    }
    if (differs) diffPixels++;
  }
  return { equalDimensions: true, diffFraction: diffPixels / pixelCount };
}
