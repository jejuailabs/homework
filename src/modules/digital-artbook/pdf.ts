import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import type { BookSnapshot } from './types';
import { containImage } from './policy';

/** Pure renderer. Hosts supply a snapshot, a licensed font and private image bytes. */
export async function renderArtbook(snapshot: BookSnapshot, fontBytes: Uint8Array, image: (index: number) => Promise<Uint8Array>) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // Full embedding avoids composite Hangul glyph loss in fontkit's TTF subsetter.
  const font = await doc.embedFont(Uint8Array.from(fontBytes), { subset: false });
  const supported = new Set(font.getCharacterSet());
  const clean = (s: string) => [...s].map(c => c === '\n' || supported.has(c.codePointAt(0)!) ? c : '?').join('');
  const mobile = snapshot.options.format === 'mobile';
  const width = mobile ? 432 : 595.28, height = mobile ? 648 : 841.89;
  const margin = mobile ? 32 : 48, inner = width - margin * 2;
  const ink = rgb(.17, .25, .22), muted = rgb(.43, .49, .45), paper = rgb(.995, .985, .96);
  const palette = {sage: [.84, .90, .83], peach: [.98, .86, .79], sky: [.83, .90, .95]} as const;
  const color = palette[snapshot.options.cover], tint = rgb(color[0], color[1], color[2]);
  let pageNo = 0;
  const text = (p: PDFPage, value: string, x: number, y: number, size = 12, color = ink) => p.drawText(clean(value), {x, y, size, font, color});
  function page(label: string) {
    const p = doc.addPage([width, height]); pageNo++;
    p.drawRectangle({x: 0, y: 0, width, height, color: paper});
    text(p, label, margin, height - 33, 9, muted);
    p.drawLine({start: {x: margin, y: 39}, end: {x: width - margin, y: 39}, thickness: .5, color: tint});
    let footer = clean(snapshot.options.displayName);
    while (font.widthOfTextAtSize(footer, 9) > inner - 35) footer = footer.slice(0, -1);
    text(p, footer, margin, 24, 9, muted);
    text(p, String(pageNo).padStart(2, '0'), width - margin - 15, 24, 9, muted);
    return p;
  }
  const lines = (value: string, size: number, max = inner) => wrapText(clean(value), font, size, max);
  const title = (p: PDFPage, value: string, y: number, size: number) => {for (const line of lines(value, size)) {text(p, line, margin, y, size); y -= size * 1.5;} return y;};
  const cover = page('CLASS GALLERY / MY ARTBOOK');
  cover.drawRectangle({x: 0, y: height * .35, width, height: height * .53, color: tint});
  text(cover, '나의 작품, 나의 이야기', margin, height * .80, 12);
  const fitTitle = (value: string, max: number, block: number) => {let size = max; while (size > 10 && lines(value, size).length * size * 1.5 > block) size--; return size;};
  title(cover, snapshot.options.title, height * .72, fitTitle(snapshot.options.title, mobile ? 26 : 34, height * .30));
  title(cover, snapshot.options.displayName, height * .28, fitTitle(snapshot.options.displayName, 24, height * .075));
  text(cover, snapshot.className, margin, height * .18, 12);
  text(cover, `${snapshot.from || '처음'} ~ ${snapshot.to || '지금'} / 작품 ${snapshot.pages.length}점`, margin, height * .13, 11, muted);
  for (let i = 0; i < snapshot.pages.length; i++) {
    // A Storage download may be a pooled Node Buffer with a nonzero byteOffset.
    // pdf-lib's JPEG decoder reads the underlying ArrayBuffer from offset zero.
    const work = snapshot.pages[i], jpg = await doc.embedJpg(Uint8Array.from(await image(i)));
    let p = page(`ARTWORK ${String(i + 1).padStart(2, '0')} / ${work.date}`);
    const top = title(p, work.title, height - 77, mobile ? 20 : 24) - 12;
    const box = {x: margin, y: work.voiceUrl ? 159 : 73, width: inner, height: top - (work.voiceUrl ? 159 : 73)};
    p.drawRectangle({...box, color: rgb(1, 1, 1), borderColor: rgb(.87, .87, .83), borderWidth: .6});
    const fit = containImage(jpg.width, jpg.height, inner - 20, box.height - 20);
    p.drawImage(jpg, {x: box.x + (inner - fit.width) / 2, y: box.y + (box.height - fit.height) / 2, ...fit});
    if (work.voiceUrl) {
      const qr = await doc.embedPng(await QRCode.toBuffer(work.voiceUrl, {width: 240, margin: 2, errorCorrectionLevel: 'M'}));
      p.drawImage(qr, {x: margin, y: 54, width: 86, height: 86});
      text(p, '작가의 목소리 듣기', margin + 98, 110, 12);
      text(p, '카메라로 QR을 비춰 주세요.', margin + 98, 89, 10, muted);
      text(p, '전시 공개 종료 시 재생도 종료돼요.', margin + 98, 70, mobile ? 8 : 10, muted);
    }
    const sections = [['작품 이야기', work.description], ['내 목소리로 남긴 이야기', work.caption]].filter(([, body]) => body.trim());
    if (sections.length) {
      p = page(`${i + 1}. ${work.date} / 작품 이야기`);
      let y = height - 73;
      for (const [heading, body] of sections) {
        if (y < 135) {p = page('작품 이야기 / 이어서'); y = height - 73;}
        text(p, heading, margin, y, 16); y -= 32;
        for (const line of lines(body, mobile ? 12 : 13)) {
          if (y < 70) {p = page('작품 이야기 / 이어서'); y = height - 73;}
          text(p, line, margin, y, mobile ? 12 : 13); y -= mobile ? 21 : 23;
        }
        y -= 28;
      }
    }
  }
  const end = page('MY LITTLE GALLERY');
  title(end, '오늘의 그림이\n내일의 추억이 되도록', height * .73, mobile ? 24 : 31);
  let closing = lines(snapshot.options.dedication || '그림마다 담긴 생각과 마음을 오래 간직해 주세요.', 13);
  let p = end, y = height * .47;
  for (const line of closing) {if (y < 85) {p = page('함께 남기는 마음 / 이어서'); y = height - 85;} text(p, line, margin, y, 13); y -= 23;}
  doc.setTitle(snapshot.options.title); doc.setAuthor(snapshot.options.displayName);
  doc.setSubject(`${snapshot.className} 학생 작품 포트폴리오`);
  doc.setCreationDate(new Date(snapshot.createdAt)); doc.setModificationDate(new Date(snapshot.createdAt));
  return doc.save();
}

/** Character wrapping also handles Korean text without spaces and explicit blank lines. */
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
