import {inflateRawSync} from 'node:zlib';

/**
 * Text of an old Hangul (HWP 5.x) file. The file is a compound document (the same container old Office used):
 * a small file system whose BodyText/SectionN streams hold the paragraphs as tagged records, usually deflated.
 * Body text comes out as lines; each table as tab-separated rows, so the result reads like the HWPX reader's.
 * Password-protected and distribution-locked files are refused with a reason.
 */
export class HwpError extends Error {}
const MAX_STREAM = 40 * 1024 * 1024, MAX_SECTIONS = 60, END = 0xfffffffe, FREE = 0xffffffff;
const fail = (): never => {throw new HwpError('한글 파일 구조를 읽지 못했어요. 한글에서 "다른 이름으로 저장 → HWPX"로 저장해 올려 주세요.');};

type Entry = {name: string; type: number; left: number; right: number; child: number; start: number; size: number};
/** Streams of a compound file, keyed by path ("BodyText/Section0"). */
export function compoundStreams(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 1536 || view.getUint32(0, true) !== 0xe011cfd0 || view.getUint32(4, true) !== 0xe11ab1a1) fail();
  const shift = view.getUint16(0x1e, true), miniShift = view.getUint16(0x20, true), size = 1 << shift, miniSize = 1 << miniShift;
  if ((shift !== 9 && shift !== 12) || miniShift !== 6) fail();
  const offset = (sector: number) => (sector + 1) * size;
  const sectorAt = (sector: number) => {const at = offset(sector); if (sector >= END || at + size > bytes.length) fail(); return at;};
  // FAT sector list: 109 in the header, the rest chained through DIFAT sectors.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {const sector = view.getUint32(0x4c + i * 4, true); if (sector < END) fatSectors.push(sector);}
  for (let difat = view.getUint32(0x44, true), guard = 0; difat < END && guard < 4096; guard++) {
    const at = sectorAt(difat);
    for (let i = 0; i < size / 4 - 1; i++) {const sector = view.getUint32(at + i * 4, true); if (sector < END) fatSectors.push(sector);}
    difat = view.getUint32(at + size - 4, true);
  }
  const perSector = size / 4, fat = (sector: number) => {
    const holder = fatSectors[Math.floor(sector / perSector)];
    return holder === undefined ? FREE : view.getUint32(sectorAt(holder) + (sector % perSector) * 4, true);
  };
  const chain = (start: number, length: number) => {
    if (length > MAX_STREAM) fail();
    const out = new Uint8Array(length);
    for (let sector = start, done = 0, guard = 0; done < length; guard++) {
      if (sector >= END || guard > 200_000) fail();
      const at = sectorAt(sector), take = Math.min(size, length - done);
      out.set(bytes.subarray(at, at + take), done); done += take; sector = fat(sector);
    }
    return out;
  };
  // Directory: follow its chain without knowing its length.
  const dirSectors: number[] = [];
  for (let sector = view.getUint32(0x30, true), guard = 0; sector < END && guard < 100_000; guard++) {dirSectors.push(sector); sector = fat(sector);}
  const entries: Entry[] = [];
  for (const sector of dirSectors) for (let i = 0; i < size / 128; i++) {
    const at = sectorAt(sector) + i * 128, length = Math.max(0, Math.min(64, view.getUint16(at + 0x40, true)) - 2);
    let name = '';
    for (let c = 0; c < length; c += 2) name += String.fromCharCode(view.getUint16(at + c, true));
    entries.push({name, type: bytes[at + 0x42], left: view.getUint32(at + 0x44, true), right: view.getUint32(at + 0x48, true), child: view.getUint32(at + 0x4c, true), start: view.getUint32(at + 0x74, true), size: view.getUint32(at + 0x78, true)});
  }
  const root = entries[0];
  if (!root || root.type !== 5) fail();
  const cutoff = view.getUint32(0x38, true) || 4096, mini = root.size ? chain(root.start, root.size) : new Uint8Array(0);
  const miniFatSectors: number[] = [];
  for (let sector = view.getUint32(0x3c, true), guard = 0; sector < END && guard < 100_000; guard++) {miniFatSectors.push(sector); sector = fat(sector);}
  const miniFat = (sector: number) => {
    const holder = miniFatSectors[Math.floor(sector / perSector)];
    return holder === undefined ? FREE : view.getUint32(sectorAt(holder) + (sector % perSector) * 4, true);
  };
  const read = (entry: Entry) => {
    if (entry.size >= cutoff) return chain(entry.start, entry.size);
    const out = new Uint8Array(entry.size);
    for (let sector = entry.start, done = 0, guard = 0; done < entry.size; guard++) {
      if (sector >= END || guard > 100_000 || (sector + 1) * miniSize > mini.length + miniSize) fail();
      const take = Math.min(miniSize, entry.size - done);
      out.set(mini.subarray(sector * miniSize, sector * miniSize + take), done); done += take; sector = miniFat(sector);
    }
    return out;
  };
  const streams = new Map<string, Uint8Array>(), seen = new Set<number>();
  const walk = (index: number, path: string) => {
    if (index >= entries.length || seen.has(index) || seen.size > 5000) return;
    seen.add(index);
    const entry = entries[index];
    walk(entry.left, path);
    if (entry.type === 2) streams.set(path + entry.name, read(entry));
    else if (entry.type === 1) walk(entry.child, `${path}${entry.name}/`);
    walk(entry.right, path);
  };
  walk(root.child, '');
  return streams;
}

const PARA_TEXT = 67, CTRL_HEADER = 71, LIST_HEADER = 72, TABLE = 77;
/** Controls that take one UTF-16 unit; every other code below 32 is an 8-unit control. */
const SINGLE = new Set([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31]);
function paragraphText(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength), units = data.length >> 1;
  let out = '';
  for (let i = 0; i < units; i++) {
    const code = view.getUint16(i * 2, true);
    if (code >= 32) {out += String.fromCharCode(code); continue;}
    if (code === 10) out += '\n'; else if (code === 30 || code === 31) out += ' '; else if (code === 24) out += '-'; else if (code === 9) out += '\t';
    if (!SINGLE.has(code)) i += 7;
  }
  return out;
}
type Table = {level: number; ready: boolean; cells: Map<string, string[]>; cell: string | null; rows: number; cols: number};
/** One section's records → lines of text, tables as TSV blocks. */
export function sectionText(data: Uint8Array): string {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength), out: string[] = [], tables: Table[] = [];
  const emit = (text: string) => {
    const open = tables[tables.length - 1];
    if (open?.cell) open.cells.get(open.cell)!.push(text); else if (!open) out.push(text);
  };
  const close = () => {
    const table = tables.pop()!, lines: string[] = [];
    for (let row = 0; row < table.rows; row++) {
      const cells: string[] = [];
      for (let col = 0; col < table.cols; col++) cells.push((table.cells.get(`${row}:${col}`) ?? []).join(' ').replace(/\s+/g, ' ').trim());
      const text = cells.join('\t').replace(/\t+$/, '');
      if (text) lines.push(text);
    }
    if (lines.length) emit(`\n${lines.join('\n')}\n`);
  };
  for (let at = 0; at + 4 <= data.length;) {
    const header = view.getUint32(at, true), tag = header & 0x3ff, level = (header >>> 10) & 0x3ff;
    let size = header >>> 20; at += 4;
    if (size === 0xfff) {if (at + 4 > data.length) break; size = view.getUint32(at, true); at += 4;}
    if (at + size > data.length) break;
    const body = data.subarray(at, at + size); at += size;
    while (tables.length && level <= tables[tables.length - 1].level) close();
    const open = tables[tables.length - 1];
    if (tag === CTRL_HEADER && size >= 4 && view.getUint32(body.byteOffset - data.byteOffset, true) === 0x74626c20 /* 'tbl ' */) tables.push({level, ready: false, cells: new Map(), cell: null, rows: 0, cols: 0});
    else if (tag === TABLE && open && level === open.level + 1) open.ready = true;
    else if (tag === LIST_HEADER && open?.ready && level === open.level + 1 && size >= 12) {
      const base = body.byteOffset - data.byteOffset, col = view.getUint16(base + 8, true), row = view.getUint16(base + 10, true);
      if (row < 500 && col < 100) {open.cell = `${row}:${col}`; open.cells.set(open.cell, open.cells.get(open.cell) ?? []); open.rows = Math.max(open.rows, row + 1); open.cols = Math.max(open.cols, col + 1);}
    }
    else if (tag === PARA_TEXT) {const text = paragraphText(body).trim(); if (text) emit(text);}
  }
  while (tables.length) close();
  return out.join('\n');
}

export function hwpText(bytes: Uint8Array): string {
  const streams = compoundStreams(bytes), header = streams.get('FileHeader');
  if (!header || header.length < 40 || !new TextDecoder('latin1').decode(header.subarray(0, 17)).startsWith('HWP Document File')) throw new HwpError('한글(HWP) 파일이 아니에요.');
  const flags = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(36, true);
  if (flags & 2) throw new HwpError('암호가 걸린 한글 파일은 읽을 수 없어요. 암호를 풀어 다시 올려 주세요.');
  if (flags & 4) throw new HwpError('배포용 한글 파일은 읽을 수 없어요. 원본을 HWPX로 저장해 올려 주세요.');
  const parts: string[] = [];
  let total = 0;
  for (let index = 0; index < MAX_SECTIONS; index++) {
    const raw = streams.get(`BodyText/Section${index}`);
    if (!raw) break;
    let data = raw;
    if (flags & 1) {try {data = inflateRawSync(raw, {maxOutputLength: MAX_STREAM});} catch {fail();}}
    if ((total += data.length) > MAX_STREAM * 2) fail();
    parts.push(sectionText(data));
  }
  if (!parts.length) fail();
  return parts.join('\n\n');
}
