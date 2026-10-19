import * as FileSystem from 'expo-file-system/legacy';

/**
 * Read EXIF Orientation (1..8) from a JPEG file. Proof/logging only.
 * Returns null if the tag is missing or the file is not a JPEG with EXIF.
 */
export async function readJpegExifOrientation(uri: string): Promise<number | null> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    if (offset + 2 > bytes.length) {
      break;
    }
    const size = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (size < 2 || offset + size > bytes.length) {
      break;
    }
    if (marker === 0xe1) {
      const orientation = parseExifOrientation(bytes, offset + 2, size - 2);
      if (orientation !== null) {
        return orientation;
      }
    }
    offset += size;
  }
  return null;
}

function parseExifOrientation(bytes: Uint8Array, start: number, length: number): number | null {
  if (length < 14) {
    return null;
  }
  if (
    bytes[start] !== 0x45 ||
    bytes[start + 1] !== 0x78 ||
    bytes[start + 2] !== 0x69 ||
    bytes[start + 3] !== 0x66 ||
    bytes[start + 4] !== 0x00 ||
    bytes[start + 5] !== 0x00
  ) {
    return null;
  }
  const tiff = start + 6;
  const little =
    bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49
      ? true
      : bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d
        ? false
        : null;
  if (little === null) {
    return null;
  }

  const read16 = (at: number) =>
    little
      ? (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8)
      : ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
  const read32 = (at: number) =>
    little
      ? ((bytes[at] ?? 0) |
          ((bytes[at + 1] ?? 0) << 8) |
          ((bytes[at + 2] ?? 0) << 16) |
          ((bytes[at + 3] ?? 0) << 24)) >>>
        0
      : (((bytes[at] ?? 0) << 24) |
          ((bytes[at + 1] ?? 0) << 16) |
          ((bytes[at + 2] ?? 0) << 8) |
          (bytes[at + 3] ?? 0)) >>>
        0;

  const ifd0 = tiff + read32(tiff + 4);
  if (ifd0 + 2 > bytes.length) {
    return null;
  }
  const entryCount = read16(ifd0);
  for (let i = 0; i < entryCount; i += 1) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > bytes.length) {
      break;
    }
    const tag = read16(entry);
    if (tag !== 0x0112) {
      continue;
    }
    const value = read16(entry + 8);
    if (value >= 1 && value <= 8) {
      return value;
    }
  }
  return null;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
