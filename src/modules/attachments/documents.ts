import {hwpxGrids, readZip, xlsxGrids, TableError} from '@/modules/curriculum/tables';
import {hwpText, HwpError} from './hwp';
import {AttachError, gridsText, tidy, type AttachKind} from './policy';

/** Files the server reads by itself, without a model: spreadsheets, Hangul documents and plain text. */
const decode = (entry: Uint8Array | undefined) => entry ? new TextDecoder().decode(entry) : '';
const unescape = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&amp;/g, '&');

/** HWPX paragraphs outside tables, one line each. Tables come separately as grids. */
export function hwpxBodyText(files: Map<string, Uint8Array>) {
  const lines: string[] = [];
  for (const name of [...files.keys()].filter(key => /^Contents\/section\d+\.xml$/i.test(key)).sort()) {
    const xml = decode(files.get(name));
    let outside = '', depth = 0, last = 0;
    for (const match of xml.matchAll(/<hp:tbl\b|<\/hp:tbl>/g)) {
      if (match[0] === '</hp:tbl>') {if (--depth === 0) last = match.index! + match[0].length;}
      else if (depth++ === 0) outside += xml.slice(last, match.index!);
    }
    outside += depth === 0 ? xml.slice(last) : '';
    for (const paragraph of outside.split(/<\/hp:p>/)) {
      const text = unescape([...paragraph.matchAll(/<hp:t\b[^>]*>([\s\S]*?)<\/hp:t>/g)].map(part => part[1].replace(/<[^>]+>/g, '')).join('')).replace(/\s+/g, ' ').trim();
      if (text) lines.push(text);
    }
  }
  return lines.join('\n');
}

/** UTF-8 first; Korean text files saved by older programs are EUC-KR. */
export function plainText(bytes: Uint8Array) {
  try {return new TextDecoder('utf-8', {fatal: true}).decode(bytes);}
  catch {try {return new TextDecoder('euc-kr').decode(bytes);} catch {throw new AttachError('글 파일의 글자를 읽지 못했어요. UTF-8로 저장해 다시 올려 주세요.');}}
}

/** Text of a document kind, or null when the kind needs a model (photo, PDF, recording). */
export function documentText(kind: AttachKind, bytes: Uint8Array): string | null {
  try {
    if (kind === 'xlsx') return tidy(gridsText(xlsxGrids(readZip(bytes))));
    if (kind === 'hwpx') {const files = readZip(bytes); return tidy([hwpxBodyText(files), gridsText(hwpxGrids(files))].filter(Boolean).join('\n\n'));}
    if (kind === 'hwp') return tidy(hwpText(bytes));
    if (kind === 'text') return tidy(plainText(bytes));
  } catch (error) {
    if (error instanceof TableError || error instanceof HwpError || error instanceof AttachError) throw new AttachError(error.message);
    throw new AttachError('파일을 읽지 못했어요. 다른 형식으로 저장해 다시 올려 주세요.');
  }
  return null;
}
