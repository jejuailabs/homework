/**
 * ZIP pieces for PDFs that are already compressed: entries are stored, not deflated.
 * The archive is written as separate parts (entry by entry, then the directory) so a
 * large set of student books never has to sit in memory at once.
 */
export type ZipEntryMeta = {name: string; crc: number; size: number; offset: number; time: number; date: number};

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
export function dosStamp(at: Date) {
  const year = Math.max(1980, at.getFullYear());
  return {time: (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2), date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate()};
}
const encoder = new TextEncoder();
/** Bit 11 marks UTF-8 names so Korean file names stay readable on Windows and macOS. */
const UTF8 = 0x0800;

/** The bytes that precede one stored file. */
export function localHeader(entry: ZipEntryMeta) {
  const name = encoder.encode(entry.name), bytes = new Uint8Array(30 + name.length), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, UTF8, true); view.setUint16(8, 0, true);
  view.setUint16(10, entry.time, true); view.setUint16(12, entry.date, true); view.setUint32(14, entry.crc, true);
  view.setUint32(18, entry.size, true); view.setUint32(22, entry.size, true); view.setUint16(26, name.length, true); view.setUint16(28, 0, true);
  bytes.set(name, 30);
  return bytes;
}
/** Where the next entry starts after this one. */
export const entryEnd = (entry: ZipEntryMeta) => entry.offset + 30 + encoder.encode(entry.name).length + entry.size;

/** The directory that closes the archive. `offset` is where it begins (the end of the last entry). */
export function centralDirectory(entries: ZipEntryMeta[], offset: number) {
  const records = entries.map(entry => {
    const name = encoder.encode(entry.name), bytes = new Uint8Array(46 + name.length), view = new DataView(bytes.buffer);
    view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true); view.setUint16(8, UTF8, true); view.setUint16(10, 0, true);
    view.setUint16(12, entry.time, true); view.setUint16(14, entry.date, true); view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.size, true); view.setUint32(24, entry.size, true); view.setUint16(28, name.length, true);
    view.setUint32(42, entry.offset, true);
    bytes.set(name, 46);
    return bytes;
  });
  const size = records.reduce((sum, r) => sum + r.length, 0), out = new Uint8Array(size + 22), view = new DataView(out.buffer);
  let at = 0;
  for (const record of records) {out.set(record, at); at += record.length;}
  view.setUint32(at, 0x06054b50, true); view.setUint16(at + 8, entries.length, true); view.setUint16(at + 10, entries.length, true);
  view.setUint32(at + 12, size, true); view.setUint32(at + 16, offset, true);
  return out;
}
