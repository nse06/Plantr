// Minimal JPEG handling for shared photos: check the file really is a JPEG, read its pixel
// size, and drop metadata segments. Phones write the photo's GPS location into EXIF, and a
// public garden photo must never reveal where someone lives. Browsers already strip EXIF when
// they re-encode photos before upload; this makes sure of it on the server.

const SOI = 0xd8;
const SOS = 0xda;
const EOI = 0xd9;

/** APP segments worth keeping: APP0 (JFIF), APP2 (ICC color profile), APP14 (Adobe color transform). */
const KEEP_APP = new Set([0xe0, 0xe2, 0xee]);

export interface CleanJpeg {
  data: Buffer;
  width: number;
  height: number;
}

export function cleanJpeg(input: Buffer): CleanJpeg | null {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== SOI) return null;
  const parts: Buffer[] = [input.subarray(0, 2)];
  let width = 0;
  let height = 0;
  let i = 2;
  while (i + 1 < input.length) {
    if (input[i] !== 0xff) return null;
    const marker = input[i + 1];
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    if (marker === EOI) return null; // an image ends before any image data
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(input.subarray(i, i + 2)); // markers without a length
      i += 2;
      continue;
    }
    if (i + 4 > input.length) return null;
    const len = input.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > input.length) return null;
    if (marker === SOS) {
      // Start of the compressed image data: keep everything from here on.
      parts.push(input.subarray(i));
      return width > 0 && height > 0 ? { data: Buffer.concat(parts), width, height } : null;
    }
    // Start-of-frame markers carry the size (C4, C8 and CC are other tables).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc && len >= 7) {
      height = input.readUInt16BE(i + 5);
      width = input.readUInt16BE(i + 7);
    }
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if (!(isApp && !KEEP_APP.has(marker)) && !isComment) parts.push(input.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return null;
}

/** Decode a `data:image/jpeg;base64,...` URL. */
export function jpegFromDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  return match ? Buffer.from(match[1], "base64") : null;
}
