import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { clampLines, pagePlan } from './policy';
import type { BookCover } from './types';

/** One work as printed. `image` is the number the host's loader understands. */
export type BookCell = {image: number; title: string; meta: string; story: string; feedback: string};
export type ClassBook = {
  title: string; className: string; period: string; volumeLabel: string; cover: BookCover; perPage: 1 | 2 | 4;
  sections: {heading: string; sub: string; cells: BookCell[]}[];
  dedication: string; createdAt: string;
};
export const CONTENTS_LINES = 26;
const WIDTH = 595.28, HEIGHT = 841.89, MARGIN = 44, INNER = WIDTH - MARGIN * 2;
const TOP = HEIGHT - 56, BOTTOM = 54;
const SIZES = {
  1: {title: 17, titleLines: 2, meta: 10, story: 11.5, storyLines: 7, feedback: 10.5, feedbackLines: 3},
  2: {title: 13, titleLines: 1, meta: 9, story: 10, storyLines: 3, feedback: 9.5, feedbackLines: 2},
  4: {title: 11, titleLines: 1, meta: 8.5, story: 9, storyLines: 2, feedback: 8.5, feedbackLines: 1},
} as const;

/** Character wrapping handles Korean text without spaces and keeps blank lines. */
export function wrapText(value: string, font: Pick<PDFFont, 'widthOfTextAtSize'>, size: number, width: number) {
  const result: string[] = [];
  for (const paragraph of value.replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const char of paragraph) {
      if (line && font.widthOfTextAtSize(line + char, size) > width) {result.push(line.trimEnd()); line = '';}
      line += char;
    }
    result.push(line.trimEnd());
  }
  return result;
}
function contain(width: number, height: number, boxWidth: number, boxHeight: number) {
  const scale = Math.min(boxWidth / width, boxHeight / height);
  return {width: width * scale, height: height * scale};
}

/**
 * Pure renderer for a class book: cover, contents, one section per student / room / month, closing page.
 * The host supplies the font and each work's JPEG bytes; nothing here reads storage.
 */
export async function renderClassBook(book: ClassBook, fontBytes: Uint8Array, image: (index: number) => Promise<Uint8Array>) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // Full embedding avoids composite Hangul glyph loss in fontkit's TTF subsetter.
  const font = await doc.embedFont(Uint8Array.from(fontBytes), {subset: false});
  const supported = new Set(font.getCharacterSet());
  const clean = (s: string) => [...s].map(c => c === '\n' || supported.has(c.codePointAt(0)!) ? c : '?').join('');
  const ink = rgb(.17, .25, .22), muted = rgb(.43, .49, .45), paper = rgb(.995, .985, .96), line = rgb(.87, .87, .83);
  const palette = {sage: [.84, .90, .83], peach: [.98, .86, .79], sky: [.83, .90, .95]} as const;
  const c = palette[book.cover], tint = rgb(c[0], c[1], c[2]);
  const size = SIZES[book.perPage];
  let pageNo = 0;
  const text = (p: PDFPage, value: string, x: number, y: number, s = 12, color = ink) => p.drawText(value, {x, y, size: s, font, color});
  const fit = (value: string, s: number, max: number) => {let v = value; while (v.length > 1 && font.widthOfTextAtSize(v, s) > max) v = v.slice(0, -2) + '…'; return v;};
  const lines = (value: string, s: number, max: number) => wrapText(clean(value), font, s, max);
  const footer = fit(clean(`${book.className} · ${book.title}`), 9, INNER - 40);
  function page(label: string) {
    const p = doc.addPage([WIDTH, HEIGHT]); pageNo++;
    p.drawRectangle({x: 0, y: 0, width: WIDTH, height: HEIGHT, color: paper});
    text(p, fit(clean(label), 9, INNER), MARGIN, HEIGHT - 33, 9, muted);
    p.drawLine({start: {x: MARGIN, y: 39}, end: {x: WIDTH - MARGIN, y: 39}, thickness: .5, color: tint});
    text(p, footer, MARGIN, 24, 9, muted);
    const no = String(pageNo).padStart(2, '0');
    text(p, no, WIDTH - MARGIN - font.widthOfTextAtSize(no, 9), 24, 9, muted);
    return p;
  }
  const block = (p: PDFPage, value: string, y: number, s: number, max = INNER, x = MARGIN) => {for (const l of lines(value, s, max)) {text(p, l, x, y, s); y -= s * 1.5;} return y;};
  const fitTitle = (value: string, max: number, room: number) => {let s = max; while (s > 12 && lines(value, s, INNER).length * s * 1.5 > room) s--; return s;};

  // Cover
  const cover = page('CLASS GALLERY / OUR ARTBOOK');
  cover.drawRectangle({x: 0, y: HEIGHT * .35, width: WIDTH, height: HEIGHT * .53, color: tint});
  text(cover, '우리 반 작품, 우리 반 이야기', MARGIN, HEIGHT * .80, 12);
  block(cover, book.title, HEIGHT * .72, fitTitle(book.title, 36, HEIGHT * .30));
  block(cover, book.className, HEIGHT * .28, fitTitle(book.className, 22, HEIGHT * .07));
  const total = book.sections.reduce((sum, s) => sum + s.cells.length, 0);
  text(cover, clean(`${book.period} / 작품 ${total}점`), MARGIN, HEIGHT * .16, 11, muted);
  if (book.volumeLabel) text(cover, clean(book.volumeLabel), MARGIN, HEIGHT * .13, 11, muted);

  // Contents: page numbers are known up front because every section starts on a new page.
  const plan = pagePlan(book.sections.map(s => s.cells.length), book.perPage, CONTENTS_LINES);
  for (let n = 0; n < plan.contents; n++) {
    const p = page(n ? '차례 / 이어서' : '차례');
    text(p, '차례', MARGIN, TOP - 14, 22);
    let y = TOP - 62;
    for (let i = n * CONTENTS_LINES; i < Math.min(book.sections.length, (n + 1) * CONTENTS_LINES); i++) {
      const s = book.sections[i], no = String(plan.starts[i]).padStart(2, '0'), noWidth = font.widthOfTextAtSize(no, 12);
      const heading = fit(clean(s.heading), 13, INNER - 140);
      text(p, heading, MARGIN, y, 13);
      text(p, clean(s.sub), MARGIN + font.widthOfTextAtSize(heading, 13) + 10, y + 1, 9.5, muted);
      text(p, no, WIDTH - MARGIN - noWidth, y, 12, muted);
      p.drawLine({start: {x: MARGIN, y: y - 8}, end: {x: WIDTH - MARGIN, y: y - 8}, thickness: .4, color: line});
      y -= 26;
    }
  }

  // Works
  const cache = new Map<number, PDFImage>();
  // A Storage download may be a pooled Node Buffer with a nonzero byteOffset; pdf-lib reads from offset zero.
  const picture = async (n: number) => cache.get(n) ?? (cache.set(n, await doc.embedJpg(Uint8Array.from(await image(n)))), cache.get(n)!);
  const gap = book.perPage === 4 ? 16 : 18, cols = book.perPage === 4 ? 2 : 1, rows = book.perPage === 1 ? 1 : 2;
  async function cell(p: PDFPage, work: BookCell, x: number, top: number, width: number, height: number) {
    const titleLines = clampLines(lines(work.title || '제목 없는 작품', size.title, width), size.titleLines);
    const storyLines = work.story.trim() ? clampLines(lines(work.story.trim(), size.story, width), size.storyLines) : [];
    const noteLines = work.feedback.trim() ? clampLines(lines('선생님 한마디  ' + work.feedback.trim(), size.feedback, width), size.feedbackLines) : [];
    const textHeight = titleLines.length * size.title * 1.4 + (work.meta ? size.meta * 1.7 : 0)
      + (storyLines.length ? storyLines.length * size.story * 1.5 + 5 : 0) + (noteLines.length ? noteLines.length * size.feedback * 1.5 + 5 : 0) + 10;
    const box = {x, y: top - (height - textHeight), width, height: height - textHeight};
    p.drawRectangle({...box, color: rgb(1, 1, 1), borderColor: line, borderWidth: .6});
    const jpg = await picture(work.image), pad = book.perPage === 4 ? 7 : 10;
    const fitted = contain(jpg.width, jpg.height, box.width - pad * 2, box.height - pad * 2);
    p.drawImage(jpg, {x: box.x + (box.width - fitted.width) / 2, y: box.y + (box.height - fitted.height) / 2, ...fitted});
    // `y` is the top of the next line; text is drawn on its baseline, one font size lower.
    let y = box.y - 8;
    const put = (value: string, s: number, color: typeof ink, leading: number) => {text(p, value, x, y - s, s, color); y -= s * leading;};
    for (const l of titleLines) put(l, size.title, ink, 1.4);
    if (work.meta) put(fit(clean(work.meta), size.meta, width), size.meta, muted, 1.7);
    if (storyLines.length) {y -= 5; for (const l of storyLines) put(l, size.story, ink, 1.5);}
    if (noteLines.length) {y -= 5; for (const l of noteLines) put(l, size.feedback, muted, 1.5);}
  }
  for (const section of book.sections) {
    for (let start = 0; start < Math.max(1, section.cells.length); start += book.perPage) {
      const first = start === 0, p = page(first ? section.heading : `${section.heading} / 이어서`);
      let top = TOP;
      if (first) {
        p.drawRectangle({x: MARGIN, y: TOP - 40, width: 5, height: 30, color: tint});
        const heading = fit(clean(section.heading), 20, INNER - 110);
        text(p, heading, MARGIN + 14, TOP - 31, 20);
        text(p, clean(section.sub), MARGIN + 14 + font.widthOfTextAtSize(heading, 20) + 12, TOP - 29, 10, muted);
        top = TOP - 58;
      }
      const width = (INNER - gap * (cols - 1)) / cols, height = (top - BOTTOM - gap * (rows - 1)) / rows;
      const cells = section.cells.slice(start, start + book.perPage);
      for (let i = 0; i < cells.length; i++)
        await cell(p, cells[i], MARGIN + (i % cols) * (width + gap), top - Math.floor(i / cols) * (height + gap), width, height);
    }
  }

  // Closing page
  const end = page('OUR LITTLE GALLERY');
  block(end, '오늘의 그림이\n내일의 추억이 되도록', HEIGHT * .73, 30);
  let p = end, y = HEIGHT * .47;
  for (const l of lines(book.dedication || '그림마다 담긴 생각과 마음을 오래 간직해 주세요.', 13, INNER)) {
    if (y < 85) {p = page('함께 남기는 마음 / 이어서'); y = HEIGHT - 85;}
    text(p, l, MARGIN, y, 13); y -= 23;
  }
  doc.setTitle(book.title); doc.setAuthor(book.className); doc.setSubject(`${book.className} 학급 작품집`);
  doc.setCreationDate(new Date(book.createdAt)); doc.setModificationDate(new Date(book.createdAt));
  return doc.save();
}
