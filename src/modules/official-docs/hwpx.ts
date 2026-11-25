import {zipParts} from '@/lib/zip-store';
import {HWPX_BLANK} from './hwpx-blank';

/**
 * Plain text → a 한글 (HWPX) document: one paragraph per line, on the blank document Hancom itself saved.
 * Runs in the browser, so the drafted text never needs another server trip to become a file.
 * Tables and character styles are not written; the teacher finishes the layout in 한글.
 */
const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clean = (value: string) => value.replace(/\t/g, '    ').replace(/[\u0000-\u0008\u000b-\u001f￾￿]/g, '');
const EMPTY_RUN = '<hp:run charPrIDRef="0"><hp:t/></hp:run>';
const run = (line: string) => line ? `<hp:run charPrIDRef="0"><hp:t>${escapeXml(line)}</hp:t></hp:run>` : EMPTY_RUN;

export function hwpxSection(blank: string, text: string) {
  const lines = clean(text.replace(/\r\n?/g, '\n')).split('\n');
  const open = /<hp:p [^>]*>/.exec(blank)?.[0];
  if (!open || !blank.includes(EMPTY_RUN) || !blank.includes('</hs:sec>')) throw new Error('HWPX template changed');
  // Line layout is dropped so 한글 lays the text out again when it opens the file.
  const first = blank.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/, '').replace(EMPTY_RUN, run(lines[0] ?? ''));
  const rest = lines.slice(1).map(line => `${open}${run(line)}</hp:p>`).join('');
  return first.replace('</hs:sec>', `${rest}</hs:sec>`);
}

function decode(base64: string) {
  const binary = atob(base64), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
export function hwpxBytes(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const parts = zipParts(HWPX_BLANK.map(part => {
    if (part.base64) return {name: part.name, data: decode(part.base64)};
    const body = part.name === 'Contents/section0.xml' ? hwpxSection(part.text!, text) : part.name === 'Preview/PrvText.txt' ? clean(text).slice(0, 1000) : part.text!;
    return {name: part.name, data: encoder.encode(body)};
  }));
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {out.set(part, offset); offset += part.length;}
  return out;
}
