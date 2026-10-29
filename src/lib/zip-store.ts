/** Minimal ZIP writer for already-compressed files (photos, videos, PDFs): entries are stored, not deflated. */
export type ZipEntry = {name: string; data: Uint8Array; modifiedAt?: Date};

/** ZIP32 limits: a browser-made archive stays well under 4GiB and 65,535 entries. */
export const ZIP_MAX_BYTES = 4 * 1024 ** 3 - 1;
export const ZIP_MAX_ENTRIES = 65_535;

let table: Uint32Array | undefined;
export function crc32(data: Uint8Array) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0;}
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  return {time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()};
}

/** Builds the archive bytes as parts; UTF-8 names (flag bit 11) keep Korean file names readable on Windows and macOS. */
export function zipParts(entries: ZipEntry[]): Uint8Array[] {
  if (entries.length > ZIP_MAX_ENTRIES) throw new Error('Too many ZIP entries');
  const encoder = new TextEncoder(), parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name), crc = crc32(entry.data), size = entry.data.length, stamp = dosTime(entry.modifiedAt ?? new Date());
    if (offset + 30 + name.length + size > ZIP_MAX_BYTES) throw new Error('ZIP too large');
    const local = new Uint8Array(30 + name.length), view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true); view.setUint16(8, 0, true);
    view.setUint16(10, stamp.time, true); view.setUint16(12, stamp.date, true); view.setUint32(14, crc, true);
    view.setUint32(18, size, true); view.setUint32(22, size, true); view.setUint16(26, name.length, true); view.setUint16(28, 0, true);
    local.set(name, 30);
    const header = new Uint8Array(46 + name.length), cv = new DataView(header.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, stamp.time, true); cv.setUint16(14, stamp.date, true); cv.setUint32(16, crc, true); cv.setUint32(20, size, true); cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    header.set(name, 46);
    parts.push(local, entry.data); central.push(header);
    offset += local.length + size;
  }
  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  return [...parts, ...central, end];
}
