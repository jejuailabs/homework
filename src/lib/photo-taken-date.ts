/**
 * The day a JPEG photo was taken, from its EXIF (DateTimeOriginal, else DateTime), as YYYY-MM-DD — or null.
 * Read in the browser from the first bytes of the file; nothing is uploaded. Photos passed through messengers
 * often lose EXIF, and PNG/WebP rarely carry it, so callers fall back to another date.
 */
export function takenDateFromBytes(buffer: ArrayBuffer): string | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset), size = view.getUint16(offset + 2);
    if ((marker & 0xff00) !== 0xff00 || size < 2) return null;
    // APP1 "Exif\0\0"
    if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) return fromTiff(view, offset + 10, Math.min(view.byteLength, offset + 2 + size));
    if (marker === 0xffda) return null; // image data starts; no EXIF before it
    offset += 2 + size;
  }
  return null;
}

function fromTiff(view: DataView, start: number, end: number): string | null {
  if (start + 8 > end) return null;
  const order = view.getUint16(start), little = order === 0x4949;
  if (!little && order !== 0x4d4d) return null;
  const u16 = (at: number) => view.getUint16(at, little), u32 = (at: number) => view.getUint32(at, little);
  const entries = (ifd: number) => {
    const at = start + ifd;
    if (at + 2 > end) return [];
    const count = u16(at), rows: {tag: number; type: number; count: number; value: number}[] = [];
    for (let index = 0; index < count && at + 2 + index * 12 + 12 <= end; index++) {const row = at + 2 + index * 12; rows.push({tag: u16(row), type: u16(row + 2), count: u32(row + 4), value: u32(row + 8)});}
    return rows;
  };
  const ascii = (entry: {type: number; count: number; value: number}) => {
    if (entry.type !== 2 || entry.count < 10) return null;
    const at = start + entry.value;
    if (at + 10 > end) return null;
    let text = '';
    for (let index = 0; index < 10; index++) text += String.fromCharCode(view.getUint8(at + index));
    return text;
  };
  const ifd0 = entries(u32(start + 4));
  const exifPointer = ifd0.find(entry => entry.tag === 0x8769);
  const exif = exifPointer ? entries(exifPointer.value) : [];
  // The first tag holding a real calendar day wins; blank, zeroed or impossible values fall through.
  for (const entry of [exif.find(row => row.tag === 0x9003), exif.find(row => row.tag === 0x9004), ifd0.find(row => row.tag === 0x0132)]) {
    const raw = entry ? ascii(entry) : null, match = raw ? /^(\d{4}):(\d{2}):(\d{2})$/.exec(raw) : null;
    if (!match || match[1] === '0000') continue;
    const day = `${match[1]}-${match[2]}-${match[3]}`, date = new Date(`${day}T00:00:00Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day) return day;
  }
  return null;
}

/** Browser helper: reads only the first 256 KB of the file. */
export async function photoTakenDate(file: Blob): Promise<string | null> {
  try {return takenDateFromBytes(await file.slice(0, 256 * 1024).arrayBuffer());} catch {return null;}
}
