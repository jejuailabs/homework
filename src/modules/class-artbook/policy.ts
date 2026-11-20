import {
  CLASS_BOOK_LIMIT, ROOM_LIMIT, STUDENT_VOLUME_SIZE, VOLUME_SIZE,
  type BookItem, type BookNames, type BookOutput, type ClassBookOptions, type Selection,
} from './types';

/** Pure rules: input checks, print order, volumes, file names. No Firebase, no PDF library. */
export class ClassBookInputError extends Error {}
const fail = (message: string): never => { throw new ClassBookInputError(message); };

export function bookDate(value: unknown): string {
  if (value === '' || value === undefined || value === null) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
    return fail('기간을 올바른 날짜로 입력해 주세요.');
  return value;
}
function field(value: unknown, limit: number, fallback = '') {
  const text = value === undefined || value === null ? fallback : value;
  if (typeof text !== 'string' || text.length > limit) return fail(`내용은 ${limit}자 이내로 입력해 주세요.`);
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f‪-‮⁦-⁩]/g, '').trim();
}
const ID = /^[A-Za-z0-9_-]{1,200}$/;
function ids(value: unknown, label: string, max: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max || value.some(v => typeof v !== 'string' || !ID.test(v)) || new Set(value).size !== value.length)
    return fail(`${label}을(를) 다시 선택해 주세요.`);
  return value as string[];
}

export function bookOptions(v: unknown): ClassBookOptions {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail('작품집 설정을 확인해 주세요.');
  const o = v as Record<string, unknown>;
  if (o.mode !== 'class' && o.mode !== 'students') return fail('반 전체 한 권인지 학생별인지 선택해 주세요.');
  const title = field(o.title, 80, '우리 반 작품집');
  if (!title) return fail('표지 제목을 입력해 주세요.');
  if (!['sage', 'peach', 'sky'].includes(String(o.cover))) return fail('표지 색을 선택해 주세요.');
  const order = o.order === undefined ? 'student' : o.order, perPage = o.perPage === undefined ? 2 : o.perPage, names = o.names === undefined ? 'name' : o.names;
  if (!['student', 'room', 'date'].includes(String(order))) return fail('차례를 선택해 주세요.');
  if (![1, 2, 4].includes(perPage as number)) return fail('한 쪽에 담을 작품 수를 선택해 주세요.');
  if (!['name', 'number', 'hidden'].includes(String(names))) return fail('이름 표시 방법을 선택해 주세요.');
  return {
    mode: o.mode, title, cover: o.cover as ClassBookOptions['cover'], order: order as ClassBookOptions['order'],
    perPage: perPage as ClassBookOptions['perPage'], names: names as BookNames,
    story: o.story !== false, feedback: o.feedback === true, unlinked: o.unlinked === true, format: o.format === 'mobile' ? 'mobile' : 'a4', dedication: field(o.dedication, 500),
  };
}

export function bookSelection(v: unknown): Selection {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail('전시와 학생을 다시 선택해 주세요.');
  const o = v as Record<string, unknown>;
  const roomIds = ids(o.roomIds, '전시실', ROOM_LIMIT), studentIds = ids(o.studentIds, '학생', 200);
  const homework = o.homework === true, board = o.board === true;
  if (!roomIds.length && !homework && !board) return fail('전시실을 하나 이상 선택해 주세요.');
  const from = bookDate(o.from), to = bookDate(o.to);
  if (from && to && from > to) return fail('시작일이 종료일보다 늦어요.');
  const exclude = o.exclude === undefined || o.exclude === null ? [] : o.exclude;
  if (!Array.isArray(exclude) || exclude.length > CLASS_BOOK_LIMIT * 2 || exclude.some(k => typeof k !== 'string' || !/^[\w-]{1,200}:[\w-]{1,200}$/.test(k)))
    return fail('뺄 작품을 다시 선택해 주세요.');
  return {roomIds, studentIds, from, to, exclude: [...new Set(exclude as string[])], homework, board};
}

export const inPeriod = (date: string, from: string, to: string) => (!from || date >= from) && (!to || date <= to);

/** How a work's maker is printed in a class book. */
export function whoLabel(item: Pick<BookItem, 'studentId' | 'studentName' | 'studentNumber' | 'artistName'>, names: BookNames) {
  if (names === 'hidden') return '';
  if (!item.studentId) return names === 'name' ? item.artistName : '';
  if (names === 'number') return item.studentNumber ? `${item.studentNumber}번` : '';
  return [item.studentNumber ? `${item.studentNumber}번` : '', item.studentName].filter(Boolean).join(' ');
}

const byDate = (a: BookItem, b: BookItem) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key);
const byStudent = (a: BookItem, b: BookItem) =>
  Number(!a.studentId) - Number(!b.studentId) || a.studentNumber - b.studentNumber || a.studentName.localeCompare(b.studentName, 'ko') || a.studentId.localeCompare(b.studentId) || byDate(a, b);

/** Windows and macOS both reject these in file names. */
export function fileName(value: string, fallback: string) {
  const cleaned = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '').slice(0, 60);
  return cleaned || fallback;
}
function chunks(list: number[], size: number) {
  const out: number[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Decides which PDF files a request produces and the order of works inside each. */
export function planOutputs(items: BookItem[], options: ClassBookOptions): BookOutput[] {
  const index = items.map((_, i) => i);
  if (options.mode === 'class') {
    const order = options.order === 'room'
      ? [...index].sort((a, b) => items[a].roomTitle.localeCompare(items[b].roomTitle, 'ko') || items[a].roomId.localeCompare(items[b].roomId) || byStudent(items[a], items[b]))
      : options.order === 'date' ? [...index].sort((a, b) => byDate(items[a], items[b])) : [...index].sort((a, b) => byStudent(items[a], items[b]));
    const parts = chunks(order, VOLUME_SIZE), base = fileName(options.title, '우리 반 작품집');
    return parts.map((indexes, i) => ({
      kind: 'class' as const, file: parts.length > 1 ? `${base}-${i + 1}권.pdf` : `${base}.pdf`, title: options.title, displayName: '',
      studentId: '', volume: i + 1, volumes: parts.length, indexes,
    }));
  }
  const groups = new Map<string, number[]>();
  for (const i of [...index].sort((a, b) => byStudent(items[a], items[b]))) {
    const item = items[i];
    if (!item.studentId) continue;
    groups.set(item.studentId, [...(groups.get(item.studentId) ?? []), i]);
  }
  const outputs: BookOutput[] = [], used = new Set<string>();
  for (const [studentId, list] of groups) {
    const first = items[list[0]], dated = [...list].sort((a, b) => byDate(items[a], items[b]));
    const parts = chunks(dated, STUDENT_VOLUME_SIZE);
    const number = first.studentNumber ? String(first.studentNumber).padStart(2, '0') + '-' : '';
    let base = number + fileName(first.studentName, '학생');
    // Two students can share a name and a missing number: keep every file name distinct.
    for (let n = 2; used.has(base); n++) base = `${number}${fileName(first.studentName, '학생')}(${n})`;
    used.add(base);
    parts.forEach((indexes, i) => outputs.push({
      kind: 'students', file: parts.length > 1 ? `${base}-${i + 1}권.pdf` : `${base}.pdf`, title: options.title, displayName: first.studentName || '학생',
      studentId, volume: i + 1, volumes: parts.length, indexes,
    }));
  }
  return outputs;
}

export type BookSection = {heading: string; sub: string; indexes: number[]};
/** Class book sections, in the same order planOutputs printed the works. */
export function sections(items: BookItem[], indexes: number[], options: ClassBookOptions): BookSection[] {
  const out: BookSection[] = [];
  let key = '', author = 0;
  for (const i of indexes) {
    const item = items[i];
    let k: string, heading: string;
    if (options.order === 'room') {k = 'r:' + item.roomId; heading = item.roomTitle || '전시';}
    else if (options.order === 'date') {k = 'd:' + item.date.slice(0, 7); heading = item.date ? `${Number(item.date.slice(0, 4))}년 ${Number(item.date.slice(5, 7))}월` : '날짜 없음';}
    else if (!item.studentId) {k = 's:'; heading = '함께 만든 작품';}
    else {
      k = 's:' + item.studentId;
      heading = options.names === 'hidden' ? '' : whoLabel(item, options.names) || '';
    }
    if (k !== key || !out.length) {
      key = k;
      if (options.order === 'student' && item.studentId) author++;
      out.push({heading: heading || (options.order === 'student' && item.studentId ? `작가 ${author}` : '작품'), sub: '', indexes: []});
    }
    out.at(-1)!.indexes.push(i);
  }
  for (const section of out) section.sub = `작품 ${section.indexes.length}점`;
  return out;
}

/** Page numbers known before rendering: cover, contents, then every section starts on a new page. */
export function pagePlan(sectionSizes: number[], perPage: number, contentsLines: number) {
  const contents = Math.max(1, Math.ceil(sectionSizes.length / contentsLines));
  let page = 1 + contents + 1;
  const starts = sectionSizes.map(size => {const start = page; page += Math.max(1, Math.ceil(size / perPage)); return start;});
  return {contents, starts, pages: page};
}

/** Keeps the first `max` lines and marks a cut with an ellipsis. */
export function clampLines(lines: string[], max: number) {
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max), last = kept[max - 1] ?? '';
  kept[max - 1] = (last.length > 2 ? last.slice(0, -1) : last) + '…';
  return kept;
}
