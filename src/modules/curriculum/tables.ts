import {inflateRawSync} from 'node:zlib';

/**
 * 올린 파일에서 표(격자)를 꺼낸다. 외부 라이브러리 없이 ZIP 구조를 직접 읽는다.
 * - XLSX: 시트마다 격자 하나(공유 문자열·숫자·인라인 문자열).
 * - HWPX(한글 2014 이후 기본 저장 형식): 본문의 표(hp:tbl)마다 격자 하나. 병합 칸은 왼쪽 위 칸에 값을 두고 나머지는 빈칸.
 * - 옛 HWP·PDF·사진은 여기서 읽지 않는다(호출한 쪽이 "HWPX나 엑셀로 저장해 올려 주세요"로 안내).
 * 서버 전용(node:zlib). 압축 폭탄을 막으려고 항목 하나 20MB, 전체 60MB까지만 푼다.
 */
export type Grid = {name: string; rows: string[][]};
export class TableError extends Error {constructor(message: string) {super(message);}}
const MAX_ENTRY = 20 * 1024 * 1024, MAX_TOTAL = 60 * 1024 * 1024;

export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = new Map<string, Uint8Array>();
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65_557); at--) if (view.getUint32(at, true) === 0x06054b50) {end = at; break;}
  if (end < 0) throw new TableError('파일 구조를 읽지 못했어요.');
  const count = view.getUint16(end + 10, true), decoder = new TextDecoder();
  let at = view.getUint32(end + 16, true), total = 0;
  for (let index = 0; index < count; index++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new TableError('파일 구조를 읽지 못했어요.');
    const method = view.getUint16(at + 10, true), compressed = view.getUint32(at + 20, true), size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true), local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extra + comment;
    if (size > MAX_ENTRY || (total += size) > MAX_TOTAL) throw new TableError('파일이 너무 커요.');
    const dataAt = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true), raw = bytes.subarray(dataAt, dataAt + compressed);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, new Uint8Array(inflateRawSync(raw, {maxOutputLength: MAX_ENTRY})));
  }
  return out;
}

const text = (entry: Uint8Array | undefined) => entry ? new TextDecoder().decode(entry) : '';
const unescape = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&amp;/g, '&');
const clean = (value: string) => unescape(value).replace(/\s+/g, ' ').trim();
const columnIndex = (ref: string) => {let n = 0; for (const char of ref.replace(/\d+$/, '')) n = n * 26 + char.charCodeAt(0) - 64; return n - 1;};

export function xlsxGrids(files: Map<string, Uint8Array>): Grid[] {
  const shared = [...text(files.get('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(match => clean([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(part => part[1]).join('')));
  const workbook = text(files.get('xl/workbook.xml')), rels = text(files.get('xl/_rels/workbook.xml.rels'));
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g)].map(match => {
    const target = rels.match(new RegExp(`Id="${match[2]}"[^>]*Target="([^"]*)"`))?.[1] ?? rels.match(new RegExp(`Target="([^"]*)"[^>]*Id="${match[2]}"`))?.[1] ?? '';
    return {name: unescape(match[1]), path: target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\.\//, '')}`};
  });
  return sheets.map(sheet => {
    const rows: string[][] = [];
    for (const row of text(files.get(sheet.path)).matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowNumber = row[1].match(/\br="(\d+)"/)?.[1];
      const cells: string[] = [];
      for (const cell of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cell[1], ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1], type = attrs.match(/t="(\w+)"/)?.[1], body = cell[2] ?? '';
        const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1], inline = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(part => part[1]).join('');
        const shown = type === 's' ? shared[Number(value)] ?? '' : type === 'inlineStr' ? clean(inline) : value !== undefined ? clean(value) : '';
        const index = ref ? columnIndex(ref) : cells.length;
        while (cells.length < index) cells.push('');
        cells[index] = shown;
      }
      const at = rowNumber ? Number(rowNumber) - 1 : rows.length;
      while (rows.length < at) rows.push([]);
      rows[at] = cells;
    }
    return {name: sheet.name, rows};
  }).filter(grid => grid.rows.some(row => row.some(Boolean)));
}

export function hwpxGrids(files: Map<string, Uint8Array>): Grid[] {
  const sections = [...files.keys()].filter(name => /^Contents\/section\d+\.xml$/i.test(name)).sort();
  const grids: Grid[] = [];
  for (const section of sections) {
    const xml = text(files.get(section));
    // 표 안의 표는 바깥 표 칸 글자로만 남는다(학교 서식은 보통 한 겹).
    for (const table of tablesOf(xml)) {
      const rows: string[][] = [];
      for (const row of table.matchAll(/<hp:tr\b[^>]*>([\s\S]*?)<\/hp:tr>/g)) {
        for (const cell of row[1].matchAll(/<hp:tc\b[^>]*>([\s\S]*?)<\/hp:tc>/g)) {
          const body = cell[1], address = body.match(/<hp:cellAddr\b[^>]*colAddr="(\d+)"[^>]*rowAddr="(\d+)"/), span = body.match(/<hp:cellSpan\b[^>]*colSpan="(\d+)"[^>]*rowSpan="(\d+)"/);
          const col = address ? Number(address[1]) : 0, rowIndex = address ? Number(address[2]) : rows.length;
          const value = clean([...body.matchAll(/<hp:t\b[^>]*>([\s\S]*?)<\/hp:t>/g)].map(part => part[1].replace(/<[^>]+>/g, '')).join(' '));
          const width = span ? Number(span[1]) : 1, height = span ? Number(span[2]) : 1;
          for (let r = rowIndex; r < rowIndex + height; r++) {
            rows[r] ??= [];
            for (let c = col; c < col + width; c++) rows[r][c] = r === rowIndex && c === col ? value : rows[r][c] ?? '';
          }
        }
      }
      for (const row of rows) for (let index = 0; index < row.length; index++) row[index] ??= '';
      if (rows.some(row => row?.some(Boolean))) grids.push({name: `표 ${grids.length + 1}`, rows: rows.map(row => row ?? [])});
    }
  }
  return grids;
}

/** 가장 바깥 hp:tbl만 잘라 낸다(정규식만으로는 중첩 표를 못 나눠 깊이를 센다). */
function tablesOf(xml: string): string[] {
  const out: string[] = [], pattern = /<hp:tbl\b|<\/hp:tbl>/g;
  let depth = 0, start = -1;
  for (const match of xml.matchAll(pattern)) {
    if (match[0] === '</hp:tbl>') {if (--depth === 0 && start >= 0) out.push(xml.slice(start, match.index! + match[0].length));}
    else if (depth++ === 0) start = match.index!;
  }
  return out;
}

export type FileKind = 'xlsx' | 'hwpx' | 'hwp' | 'pdf' | 'image' | 'other';
export function fileKind(name: string, bytes: Uint8Array): FileKind {
  const head = Array.from(bytes.subarray(0, 8));
  if (head[0] === 0x50 && head[1] === 0x4b) return /\.hwpx$/i.test(name) ? 'hwpx' : /\.xlsx$/i.test(name) ? 'xlsx' : (() => {try {const files = readZip(bytes); return files.has('Contents/content.hpf') || [...files.keys()].some(key => key.startsWith('Contents/section')) ? 'hwpx' : files.has('xl/workbook.xml') ? 'xlsx' : 'other';} catch {return 'other';}})();
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return 'hwp';
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return 'pdf';
  if ((head[0] === 0xff && head[1] === 0xd8) || (head[0] === 0x89 && head[1] === 0x50)) return 'image';
  return 'other';
}

/** 파일 하나 → 격자 목록. 읽을 수 없는 형식은 이유를 담아 막는다. */
export function gridsOf(name: string, bytes: Uint8Array): Grid[] {
  const kind = fileKind(name, bytes);
  if (kind === 'xlsx') return xlsxGrids(readZip(bytes));
  if (kind === 'hwpx') return hwpxGrids(readZip(bytes));
  if (kind === 'hwp') throw new TableError('옛 한글(HWP) 파일은 아직 못 읽어요. 한글에서 "다른 이름으로 저장 → HWPX"로 저장해 올려 주세요.');
  if (kind === 'pdf' || kind === 'image') throw new TableError('PDF·사진은 다음 단계에서 읽어요. 지금은 엑셀(XLSX)이나 한글(HWPX)로 올려 주세요.');
  throw new TableError('엑셀(XLSX)이나 한글(HWPX) 파일만 읽을 수 있어요.');
}
