'use client';

import {spaceItem, type DiaryLayer, type DiaryPage} from './catalog';
import {diaryInkPath, DIARY_HEIGHT, DIARY_WIDTH} from './diary-ink';

export const MAX_DIARY_PDF_PAGES = 120;
const FONT = 'Arial, "Noto Sans KR", sans-serif';
function checkExport(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('일기장이 잠겨서 내려받기를 멈췄어요.', 'AbortError');
}

function canvas(width: number, height: number) {
  const result = document.createElement('canvas');
  result.width = Math.ceil(width); result.height = Math.ceil(height);
  const context = result.getContext('2d');
  if (!context) throw new Error('이 기기에서 PDF 그림을 만들 수 없어요. 다른 브라우저에서 다시 시도해 주세요.');
  return {canvas: result, context};
}

function png(image: HTMLCanvasElement): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => image.toBlob(blob => {
    if (!blob) {reject(new Error('일기 그림을 만들지 못했어요.')); return;}
    void blob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)), reject);
  }, 'image/png'));
}

async function imageFromUrl(path: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  checkExport(signal);
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin) throw new Error('외부 이미지는 비밀일기 PDF에 넣을 수 없어요.');
  const controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), 25000);
  const abort = () => controller.abort(); signal?.addEventListener('abort', abort, {once: true});
  let objectUrl = '';
  try {
    const response = await fetch(url, {credentials: 'same-origin', cache: 'no-store', signal: controller.signal});
    if (!response.ok) throw new Error('사진이나 스티커를 불러오지 못했어요. 일기장 잠금을 확인한 뒤 다시 내려받아 주세요.');
    const blob = await response.blob();
    checkExport(signal);
    if (!blob.type.startsWith('image/') || blob.size > 12 * 1024 * 1024) throw new Error('이미지 형식이나 크기를 확인해 주세요.');
    objectUrl = URL.createObjectURL(blob);
    const result = new Image();
    result.src = objectUrl;
    await result.decode();
    checkExport(signal);
    if (!result.naturalWidth || !result.naturalHeight) throw new Error('빈 이미지는 PDF에 넣을 수 없어요.');
    return result;
  } finally {clearTimeout(timeout); signal?.removeEventListener('abort', abort); if (objectUrl) URL.revokeObjectURL(objectUrl);}
}

/** Wrap by grapheme, keeping explicit line breaks and spaces like the inline writing area. */
export function diaryTextLines(text: string, width: number, measure: (text: string) => number): string[] {
  const result: string[] = [];
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ko', {granularity: 'grapheme'}) : null;
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    const letters = segmenter ? [...segmenter.segment(paragraph)].map(part => part.segment) : Array.from(paragraph);
    let line = '';
    for (const letter of letters) {
      if (line && measure(line + letter) > width) {result.push(line); line = letter;}
      else line += letter;
    }
    result.push(line);
  }
  return result;
}

/** The editor rotates around the centre of its auto-height text box. */
export function diaryTextBoxOutsidePage(layer: Pick<DiaryLayer, 'x' | 'y' | 'size' | 'rotation'>, height: number): boolean {
  const width = DIARY_WIDTH * layer.size / 100;
  if (![width, height, layer.x, layer.y, layer.rotation].every(Number.isFinite) || width <= 0 || height <= 0) return true;
  const angle = layer.rotation * Math.PI / 180;
  const extentX = (Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height) / 2;
  const extentY = (Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height) / 2;
  const centreX = DIARY_WIDTH * layer.x / 100, centreY = DIARY_HEIGHT * layer.y / 100, epsilon = .001;
  return centreX - extentX < -epsilon || centreX + extentX > DIARY_WIDTH + epsilon
    || centreY - extentY < -epsilon || centreY + extentY > DIARY_HEIGHT + epsilon;
}

function drawPaper(context: CanvasRenderingContext2D, paper: string) {
  context.fillStyle = spaceItem(paper)?.color || '#fffbee';
  context.fillRect(0, 0, DIARY_WIDTH, DIARY_HEIGHT);
  context.strokeStyle = paper === 'paper-sky' ? '#c4d6dd70' : '#d7d7b75c';
  context.lineWidth = 1;
  if (paper === 'paper-sage') {
    context.fillStyle = '#adc5a370';
    for (let x = 10; x < DIARY_WIDTH; x += 20) for (let y = 10; y < DIARY_HEIGHT; y += 20) {
      context.beginPath(); context.arc(x, y, 1, 0, Math.PI * 2); context.fill();
    }
  } else {
    const spacing = paper === 'paper-sky' ? 24 : 32;
    context.beginPath();
    for (let y = paper === 'paper-sky' ? .5 : 31.5; y < DIARY_HEIGHT; y += spacing) {context.moveTo(0, y); context.lineTo(DIARY_WIDTH, y);}
    if (paper === 'paper-sky') for (let x = .5; x < DIARY_WIDTH; x += spacing) {context.moveTo(x, 0); context.lineTo(x, DIARY_HEIGHT);}
    context.stroke();
  }
  context.fillStyle = paper === 'paper-sky' ? '#c8dbe0' : paper === 'paper-sage' ? '#ccd9bc' : '#e1ceb0';
  context.fillRect(0, 0, 13, DIARY_HEIGHT);
  context.strokeStyle = '#e6b7af6b'; context.beginPath(); context.moveTo(32.5, 0); context.lineTo(32.5, DIARY_HEIGHT); context.stroke();
  context.font = `9px ${FONT}`; context.fillStyle = '#b7b29a'; context.letterSpacing = '2.52px'; context.fillText('MY LITTLE DIARY', 65, 42);
  context.letterSpacing = '0px'; context.font = `22px ${FONT}`; context.fillStyle = '#c8b995'; context.fillText('✦', DIARY_WIDTH - 61, 46);
  context.font = `10px ${FONT}`; context.fillStyle = '#c1baa5'; context.letterSpacing = '1.7px'; context.textAlign = 'center';
  context.fillText('오늘의 마음을 소중히', DIARY_WIDTH / 2, DIARY_HEIGHT - 24); context.letterSpacing = '0px'; context.textAlign = 'left';
}

function drawText(context: CanvasRenderingContext2D, layer: DiaryLayer, width: number) {
  const size = layer.fontSize || 24, lineHeight = size * 1.65, text = layer.text || '';
  if (!text) return;
  context.font = `${size}px ${FONT}`;
  context.fillStyle = layer.color || '#3f5048';
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  // Measure the same inline box the editor uses. A browser's Hangul/Latin wrapping
  // and fallback-font metrics are more reliable here than guessing from character counts.
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, {position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden', width: `${width}px`,
    padding: '8px', boxSizing: 'border-box', margin: '0', border: '0', fontFamily: FONT, fontSize: `${size}px`,
    fontWeight: '400', lineHeight: '1.65', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word',
    textAlign: layer.align || 'left', letterSpacing: 'normal'});
  const node = document.createTextNode(text.endsWith('\n') ? text + '\u200b' : text); box.appendChild(node); document.body.appendChild(box);
  try {
    const bounds = box.getBoundingClientRect(), range = document.createRange();
    if (diaryTextBoxOutsidePage(layer, bounds.height))
      throw new Error('글이 종이 밖으로 나가 PDF를 만들 수 없어요. 글자 크기나 위치를 조절하거나 다음 페이지에 이어 써 주세요.');
    const segments = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('ko', {granularity: 'grapheme'}).segment(text)].map(part => ({value: part.segment, index: part.index}))
      : Array.from(text).map((value, index, all) => ({value, index: all.slice(0, index).join('').length}));
    const lines: {text: string; x: number; top: number; height: number}[] = [];
    for (const segment of segments) {
      if (segment.value === '\n' || segment.value === '\r') continue;
      range.setStart(node, segment.index); range.setEnd(node, segment.index + segment.value.length);
      const rect = range.getBoundingClientRect(), previous = lines.at(-1);
      if (previous && Math.abs(previous.top - rect.top) < lineHeight * .45) previous.text += segment.value;
      else lines.push({text: segment.value, x: rect.left - bounds.left, top: rect.top, height: rect.height});
    }
    for (const line of lines) {
      const metrics = context.measureText(line.text), ascent = metrics.fontBoundingBoxAscent || size * .9, descent = metrics.fontBoundingBoxDescent || size * .25;
      const baseline = (line.height - ascent - descent) / 2 + ascent;
      context.fillText(line.text, -width / 2 + line.x, -bounds.height / 2 + line.top - bounds.top + baseline);
    }
  } finally {box.remove();}
}

async function drawLayer(context: CanvasRenderingContext2D, layer: DiaryLayer, images: Map<string, Promise<HTMLImageElement>>, signal?: AbortSignal) {
  checkExport(signal);
  const width = DIARY_WIDTH * layer.size / 100;
  context.save();
  try {
    context.translate(DIARY_WIDTH * layer.x / 100, DIARY_HEIGHT * layer.y / 100);
    context.rotate(layer.rotation * Math.PI / 180);
    context.scale(layer.flip ? -1 : 1, 1);
    if (layer.kind === 'ink') {
      context.scale(layer.size / 100, layer.size / 100);
      context.translate(-DIARY_WIDTH / 2, -DIARY_HEIGHT / 2);
      context.globalAlpha = layer.opacity ?? 1;
      context.fillStyle = layer.color || '#355147';
      context.fill(new Path2D(diaryInkPath(layer)));
      return;
    }
    if (layer.kind === 'text') {drawText(context, layer, width); return;}
    const item = spaceItem(layer.itemId);
    const path = layer.kind === 'photo' ? `/api/secret-diary/assets/photo/${encodeURIComponent(layer.assetId || '')}`
      : layer.kind === 'art' ? `/api/secret-diary/assets/art/${encodeURIComponent(layer.assetId || '')}` : item?.art;
    if (path) {
      if (!images.has(path)) images.set(path, imageFromUrl(path, signal));
      const image = await images.get(path)!;
      checkExport(signal);
      const height = width * image.naturalHeight / image.naturalWidth;
      context.drawImage(image, -width / 2, -height / 2, width, height);
      return;
    }
    if (item?.motif === 'tape') {
      context.fillStyle = '#e9b8a9'; context.globalAlpha = .85; context.fillRect(-width / 2, -20, width, 40);
      context.save(); context.beginPath(); context.rect(-width / 2, -20, width, 40); context.clip();
      context.strokeStyle = '#f5d4c8'; context.lineWidth = 10;
      for (let x = -width / 2 - 50; x < width / 2 + 50; x += 22) {context.beginPath(); context.moveTo(x, -20); context.lineTo(x + 40, 20); context.stroke();}
      context.restore(); return;
    }
    if (item?.motif) {
      context.font = `${width * .82}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(item.motif, 0, 0); return;
    }
    throw new Error('이 일기에 사용된 스티커를 찾을 수 없어요. 내용을 빠뜨리지 않도록 내려받기를 멈췄어요.');
  } finally {context.restore();}
}

/** Render the canonical paper locally. Nothing is uploaded to generate a PDF. */
export async function renderDiaryPagePng(page: DiaryPage, scale = 2, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  checkExport(signal);
  if (!Number.isFinite(scale) || scale < 1 || scale > 3) throw new Error('PDF 이미지 크기를 확인해 주세요.');
  await document.fonts.ready;
  checkExport(signal);
  const result = canvas(DIARY_WIDTH * scale, DIARY_HEIGHT * scale);
  try {
    result.context.scale(scale, scale);
    result.context.beginPath(); result.context.roundRect(0, 0, DIARY_WIDTH, DIARY_HEIGHT, [3, 13, 13, 3]); result.context.clip();
    drawPaper(result.context, page.paper);
    const images = new Map<string, Promise<HTMLImageElement>>();
    for (let index = 0; index < page.layers.length; index++) {
      // Give an automatic lock/tab-hide event time to cancel a long page between batches.
      if (index && index % 20 === 0) await new Promise<void>(resolve => window.setTimeout(resolve, 0));
      await drawLayer(result.context, page.layers[index], images, signal);
    }
    const bytes = await png(result.canvas);
    if (signal?.aborted) {bytes.fill(0); checkExport(signal);}
    return bytes;
  } finally {result.canvas.width = 1; result.canvas.height = 1;}
}

async function pageHeader(page: DiaryPage) {
  const result = canvas(DIARY_WIDTH * 2, 56 * 2), context = result.context;
  try {
    context.scale(2, 2); context.fillStyle = '#fffdf7'; context.fillRect(0, 0, DIARY_WIDTH, 56);
    context.font = `20px ${FONT}`; context.fillStyle = '#52685c';
    let title = page.title;
    while (title && context.measureText(title).width > 540) title = title.slice(0, -1);
    if (title !== page.title) title = title.slice(0, -1) + '…';
    context.fillText(title, 18, 34);
    context.font = `14px ${FONT}`; context.textAlign = 'right'; context.fillStyle = '#7b8574';
    context.fillText(page.date, DIARY_WIDTH - 18, 34);
    return await png(result.canvas);
  } finally {result.canvas.width = 1; result.canvas.height = 1;}
}

export async function renderDiaryPdf(pages: DiaryPage[], signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  checkExport(signal);
  if (!pages.length) throw new Error('내려받을 일기를 먼저 골라 주세요.');
  if (pages.length > MAX_DIARY_PDF_PAGES) throw new Error(`PDF는 한 번에 ${MAX_DIARY_PDF_PAGES}장까지 만들 수 있어요. 날짜를 나누어 골라 주세요.`);
  const {PDFDocument} = await import('pdf-lib');
  checkExport(signal);
  const pdf = await PDFDocument.create();
  pdf.setTitle('나의 비밀일기'); pdf.setCreator('Our Classroom · 나의 비밀일기');
  // A 2x PNG keeps Hangul, translucent ink, vector stickers and every layer in their visible order.
  // The fixed 720:960 paper ratio is preserved; title/date are outside the decorated page.
  for (const page of pages) {
    checkExport(signal);
    const bytes = await renderDiaryPagePng(page, 2, signal), header = await pageHeader(page);
    try {
      checkExport(signal);
      const image = await pdf.embedPng(bytes), heading = await pdf.embedPng(header);
      checkExport(signal);
      const sheet = pdf.addPage([540, 762]);
      sheet.drawImage(image, {x: 0, y: 0, width: 540, height: 720});
      sheet.drawImage(heading, {x: 0, y: 720, width: 540, height: 42});
    } finally {bytes.fill(0); header.fill(0);}
  }
  checkExport(signal);
  const bytes = Uint8Array.from(await pdf.save());
  if (signal?.aborted) {bytes.fill(0); checkExport(signal);}
  return bytes;
}

export async function exportDiaryPdf(pages: DiaryPage[], filename = '나의 비밀일기.pdf', signal?: AbortSignal): Promise<void> {
  checkExport(signal);
  const bytes = await renderDiaryPdf(pages, signal);
  if (signal?.aborted) {bytes.fill(0); checkExport(signal);}
  const blob = new Blob([bytes], {type: 'application/pdf'}), url = URL.createObjectURL(blob);
  bytes.fill(0);
  const link = document.createElement('a');
  link.href = url; link.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  if (signal?.aborted) {URL.revokeObjectURL(url); checkExport(signal);}
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
