import {cardFrontKey} from './cards-ai-draft';
import {CARD_ALTERNATIVE_LIMIT, CARD_EXAMPLE_LIMIT, CARD_TEXT_LIMIT} from './cards-logic';

export type ImportedCard = {front: string; back: string; example: string; alternatives: string[]};
export type CardImportError = {line: number; reason: 'format' | 'empty' | 'length' | 'limit'};
export type CardImportResult = {cards: ImportedCard[]; errors: CardImportError[]};

/** CSV/TSV with quoted delimiters, escaped quotes and multiline cells. */
export function parseCardImport(source: string): CardImportResult {
  const value = source.replace(/^\uFEFF/, '');
  if (value.length > 250_000) return {cards: [], errors: [{line: 1, reason: 'limit'}]};
  let delimiter = ',', headerQuoted = false, headerStarted = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '"') {if (headerQuoted && value[i + 1] === '"') i++; else headerQuoted = !headerQuoted; headerStarted = true;}
    else if (!headerQuoted && (char === '\r' || char === '\n')) {if (headerStarted) break;}
    else if (!headerQuoted && char === '\t') delimiter = '\t';
    else if (char.trim()) headerStarted = true;
  }
  const rows: {cells: string[]; line: number}[] = [];
  let cells: string[] = [], cell = '', quoted = false, closed = false, line = 1, start = 1;
  const fail = (): CardImportResult => ({cards: [], errors: [{line, reason: 'format'}]});
  for (let i = 0; i <= value.length; i++) {
    const char = value[i];
    if (quoted) {
      if (char === undefined) return fail();
      if (char === '"') {
        if (value[i + 1] === '"') {cell += '"'; i++;} else {quoted = false; closed = true;}
      } else {cell += char; if (char === '\n') line++;}
      continue;
    }
    if (char === delimiter) {cells.push(cell.trim()); cell = ''; closed = false;}
    else if (char === undefined || char === '\n' || char === '\r') {
      cells.push(cell.trim());
      if (cells.some(Boolean)) rows.push({cells, line: start});
      cells = []; cell = ''; closed = false;
      if (char === '\r' && value[i + 1] === '\n') i++;
      line++; start = line;
    } else if (char === '"') {
      if (closed || cell.trim()) return fail();
      cell = ''; quoted = true;
    } else if (closed && char.trim()) return fail();
    else cell += char;
  }
  if (rows[0] && /^(front|앞면|단어)$/i.test(rows[0].cells[0]) && /^(back|뒷면|뜻)$/i.test(rows[0].cells[1])) rows.shift();
  return checkImportRows(rows);
}

type SourceRow = {cells: string[]; line: number};
/** Shared by pasted text and spreadsheets: 2-4 cells (front, back, example, alternatives split by |), at most 200 rows. */
function checkImportRows(rows: SourceRow[]): CardImportResult {
  if (!rows.length) return {cards: [], errors: [{line: 1, reason: 'empty'}]};
  if (rows.length > 200) return {cards: [], errors: [{line: rows[200].line, reason: 'limit'}]};
  const result: CardImportResult = {cards: [], errors: []};
  for (const row of rows) {
    const [front, back, example = '', alternatives = ''] = row.cells;
    if (row.cells.length < 2 || row.cells.length > 4) {result.errors.push({line: row.line, reason: 'format'}); continue;}
    if (!front || !back) {result.errors.push({line: row.line, reason: 'empty'}); continue;}
    const accepted = alternatives.split('|').map(s => s.trim()).filter(Boolean);
    if (front.length > CARD_TEXT_LIMIT || back.length > CARD_TEXT_LIMIT || example.length > CARD_EXAMPLE_LIMIT || accepted.length > CARD_ALTERNATIVE_LIMIT || accepted.some(s => s.length > CARD_TEXT_LIMIT)) {result.errors.push({line: row.line, reason: 'length'}); continue;}
    result.cards.push({front, back, example, alternatives: accepted});
  }
  return result;
}

/* .xlsx without a library: an .xlsx is a ZIP of XML parts. Only the first sheet's cell text is read; formulas give their saved value. */
export const CARD_XLSX_BYTES = 5 * 1024 * 1024;
const XLSX_PART_BYTES = 8 * 1024 * 1024, XLSX_COLUMNS = 50;
export class CardXlsxError extends Error {}
type ZipEntry = {method: number; compressed: number; local: number};

function zipEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), entries = new Map<string, ZipEntry>(), names = new TextDecoder();
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) if (view.getUint32(i, true) === 0x06054b50) {end = i; break;}
  if (end < 0) throw new CardXlsxError('not a zip');
  let at = view.getUint32(end + 16, true);
  for (let n = view.getUint16(end + 10, true); n > 0; n--) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new CardXlsxError('broken directory');
    const nameLength = view.getUint16(at + 28, true);
    entries.set(names.decode(bytes.subarray(at + 46, at + 46 + nameLength)), {method: view.getUint16(at + 10, true), compressed: view.getUint32(at + 20, true), local: view.getUint32(at + 42, true)});
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return {entries, view};
}
async function zipText(bytes: Uint8Array, zip: ReturnType<typeof zipEntries>, name: string) {
  const entry = zip.entries.get(name);
  if (!entry) return null;
  if (entry.local + 30 > bytes.length || zip.view.getUint32(entry.local, true) !== 0x04034b50) throw new CardXlsxError('broken entry');
  const start = entry.local + 30 + zip.view.getUint16(entry.local + 26, true) + zip.view.getUint16(entry.local + 28, true), data = bytes.slice(start, start + entry.compressed);
  if (data.length !== entry.compressed) throw new CardXlsxError('truncated');
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new CardXlsxError('compression');
  // The cap counts inflated bytes, so a small file cannot expand without limit.
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(), parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > XLSX_PART_BYTES) {await reader.cancel(); throw new CardXlsxError('too large');}
    parts.push(value);
  }
  const whole = new Uint8Array(size); let offset = 0;
  for (const part of parts) {whole.set(part, offset); offset += part.length;}
  return new TextDecoder().decode(whole);
}
const ENTITIES: Record<string, string> = {lt: '<', gt: '>', amp: '&', quot: '"', apos: "'"};
const xmlText = (value: string) => value
  .replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, entity: string) => entity[0] === '#' ? String.fromCodePoint(parseInt(entity.slice(entity[1] === 'x' || entity[1] === 'X' ? 2 : 1), entity[1] === 'x' || entity[1] === 'X' ? 16 : 10)) : ENTITIES[entity.toLowerCase()])
  .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
/** Text runs of a shared or inline string; phonetic guides (rPh) are not part of the text. */
const runs = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(match => xmlText(match[1])).join('');
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const columnIndex = (ref: string | undefined) => {const letters = ref?.match(/^[A-Z]+/i)?.[0].toUpperCase(); return letters ? [...letters].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1 : -1;};

/** Rows of the first worksheet as text cells, with spreadsheet row numbers. */
export async function readXlsxRows(bytes: Uint8Array): Promise<SourceRow[]> {
  if (bytes.length > CARD_XLSX_BYTES) throw new CardXlsxError('too large');
  const zip = zipEntries(bytes), workbook = await zipText(bytes, zip, 'xl/workbook.xml');
  if (workbook === null) throw new CardXlsxError('not a workbook');
  const firstSheet = workbook.match(/<(?:\w+:)?sheet\b[^>]*>/)?.[0] ?? '', relationId = firstSheet.match(/\s[\w]+:id="([^"]+)"/)?.[1];
  const relations = await zipText(bytes, zip, 'xl/_rels/workbook.xml.rels') ?? '';
  const target = [...relations.matchAll(/<Relationship\b[^>]*>/g)].map(match => match[0]).find(tag => attr(tag, 'Id') === relationId);
  const href = target ? attr(target, 'Target') ?? '' : '', path = href ? (href.startsWith('/') ? href.slice(1) : `xl/${href.replace(/^\.\//, '')}`) : 'xl/worksheets/sheet1.xml';
  const sheet = await zipText(bytes, zip, path);
  if (sheet === null) throw new CardXlsxError('no sheet');
  const shared = [...(await zipText(bytes, zip, 'xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(match => runs(match[1]));
  const rows: SourceRow[] = [];
  let rowNumber = 0;
  for (const row of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    rowNumber = Number(attr(row[1], 'r')) || rowNumber + 1;
    const cells: string[] = [];
    let column = -1;
    for (const cell of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const at = columnIndex(attr(cell[1], 'r')), type = attr(cell[1], 't'), body = cell[2] ?? '', raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      column = at >= 0 ? at : column + 1;
      if (column >= XLSX_COLUMNS) continue;
      const text = type === 's' ? shared[Number(raw)] ?? '' : type === 'inlineStr' ? runs(body) : type === 'b' ? (raw === '1' ? 'TRUE' : 'FALSE') : raw === undefined ? '' : xmlText(raw);
      cells[column] = text.trim();
    }
    const filled = Array.from(cells, cell => cell ?? '');
    while (filled.length && !filled.at(-1)) filled.pop();
    if (filled.length) rows.push({cells: filled, line: rowNumber});
  }
  return rows;
}

const HEADERS: [RegExp, number][] = [[/^(front|word|english|앞면|단어|영어)/i, 0], [/^(back|meaning|korean|뒷면|뜻|의미|우리말)/i, 1], [/^(example|sentence|예문|예시)/i, 2], [/^(alternatives?|accepted|대체\s*정답|다른\s*정답|인정\s*답)/i, 3]];
/** A header row with front and back columns maps columns by name (others ignored); otherwise columns are positional like a paste. */
export function spreadsheetImport(rows: SourceRow[]): CardImportResult {
  const header = rows[0]?.cells.map(cell => HEADERS.find(([pattern]) => pattern.test(cell.replace(/\s+/g, ' ').trim()))?.[1] ?? -1);
  if (!header || !header.includes(0) || !header.includes(1)) return checkImportRows(rows);
  const take = (cells: string[], slot: number) => {const index = header.indexOf(slot); return index >= 0 ? cells[index] ?? '' : '';};
  return checkImportRows(rows.slice(1).map(row => ({line: row.line, cells: [0, 1, 2, 3].map(slot => take(row.cells, slot))})).filter(row => row.cells.some(Boolean)));
}
export async function parseCardXlsx(bytes: Uint8Array) {return spreadsheetImport(await readXlsxRows(bytes));}

/** Every bad line, grouped by what is wrong with it, so one message can list them all. */
export function groupImportErrors(errors: CardImportError[]) {
  const groups = new Map<CardImportError['reason'], number[]>();
  for (const {line, reason} of errors) groups.set(reason, [...groups.get(reason) ?? [], line]);
  return [...groups].map(([reason, lines]) => ({reason, lines}));
}

/** Cards whose fronts match, by 1-based position. Blank fronts are left for the "required" check. */
export function findDuplicateFronts(cards: {front: string}[]) {
  const seen = new Map<string, {front: string; numbers: number[]}>();
  cards.forEach((card, index) => {
    const key = cardFrontKey(card.front);
    if (!key) return;
    const group = seen.get(key);
    if (group) group.numbers.push(index + 1); else seen.set(key, {front: card.front.trim(), numbers: [index + 1]});
  });
  return [...seen.values()].filter(group => group.numbers.length > 1);
}
/** Keeps the first card of each duplicate group and every blank row. */
export function removeDuplicateFronts<T extends {front: string}>(cards: T[]) {
  const later = new Set(findDuplicateFronts(cards).flatMap(group => group.numbers.slice(1)));
  return cards.filter((_, index) => !later.has(index + 1));
}

export function cardsCsv(rows: string[][]) {
  const escape = (cell: string) => `"${(/^[\s]*[=+@\-]/.test(cell) ? `'${cell}` : cell).replaceAll('"', '""')}"`;
  return '\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n');
}
