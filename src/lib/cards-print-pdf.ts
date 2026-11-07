// Draws a card print plan with pdf-lib. Loaded only when a teacher presses 만들기, so pdf-lib and fontkit stay out of the page bundle.
import {PDFDocument, StandardFonts, TextRenderingMode, grayscale, popGraphicsState, pushGraphicsState, setLineWidth, setTextRenderingMode, type PDFFont, type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {A4, cardPrintRuns, type CardPrintLayout, type CardPrintMeasure, type CardPrintOp} from './cards-print';

type Fonts = {regular: PDFFont; bold: PDFFont; korean: PDFFont};
const EM = 1000, BOLD_STROKE = .035; // The bundled Korean font has one weight, so bold Korean is filled and outlined.
function drawText(page: PDFPage, op: Extract<CardPrintOp, {t: 'text'}>, fonts: Fonts, runsOf: (value: string) => ReturnType<typeof cardPrintRuns>, width: (font: PDFFont, value: string) => number) {
  const color = grayscale(op.gray ?? 0);
  let x = op.x;
  for (const run of runsOf(op.text)) {
    const font = run.font === 'korean' ? fonts.korean : op.bold ? fonts.bold : fonts.regular;
    const heavy = op.bold && run.font === 'korean';
    if (heavy) page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.FillAndOutline), setLineWidth(op.size * BOLD_STROKE));
    page.drawText(run.text, {x, y: op.y, size: op.size, font, color});
    if (heavy) page.pushOperators(popGraphicsState());
    x += width(font, run.text) * op.size / EM;
  }
}
function drawShape(page: PDFPage, op: Exclude<CardPrintOp, {t: 'text'}>) {
  if (op.t === 'circle') page.drawCircle({x: op.x, y: op.y, size: op.r, borderColor: grayscale(0), borderWidth: op.line});
  else if (op.t === 'line') page.drawLine({start: {x: op.x1, y: op.y1}, end: {x: op.x2, y: op.y2}, thickness: op.width ?? .5, color: grayscale(op.gray ?? 0), dashArray: op.dash});
  else page.drawRectangle({x: op.x, y: op.y, width: op.w, height: op.h, ...(op.fill === undefined ? {} : {color: grayscale(op.fill)}), ...(op.line ? {borderColor: grayscale(op.gray ?? 0), borderWidth: op.line, borderDashArray: op.dash} : {borderWidth: 0})});
}
/** `plan` receives a measure backed by the real fonts, so wrapping always matches what is drawn. */
export async function renderCardPrintPdf(plan: (measure: CardPrintMeasure) => CardPrintLayout, koreanFont: Uint8Array, meta: {title: string; language: string}) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // Full embedding, as in the artbook: fontkit's subsetter loses composite Hangul glyphs.
  const fonts: Fonts = {regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), korean: await doc.embedFont(koreanFont, {subset: false})};
  const latin = new Set(fonts.regular.getCharacterSet()), korean = new Set(fonts.korean.getCharacterSet()), missing = new Set<string>(), widths = new Map<string, number>(), ids = new Map([[fonts.regular, 'r'], [fonts.bold, 'b'], [fonts.korean, 'k']]);
  const runsOf = (value: string) => cardPrintRuns(value, code => latin.has(code), code => korean.has(code), missing);
  const width = (font: PDFFont, value: string) => {
    const key = ids.get(font) + value;
    let result = widths.get(key);
    if (result === undefined) {result = font.widthOfTextAtSize(value, EM); widths.set(key, result);}
    return result;
  };
  const measure: CardPrintMeasure = (value, size, bold) => runsOf(value).reduce((total, run) => total + width(run.font === 'korean' ? fonts.korean : bold ? fonts.bold : fonts.regular, run.text) * size / EM, 0);
  const layout = plan(measure);
  for (const ops of layout.pages) {
    const page = doc.addPage([A4.width, A4.height]);
    for (const op of ops) if (op.t === 'text') drawText(page, op, fonts, runsOf, width); else drawShape(page, op);
  }
  doc.setTitle(meta.title); doc.setLanguage(meta.language); doc.setCreator('모두의 교실 카드놀이'); doc.setProducer('모두의 교실');
  return {bytes: await doc.save(), layout, missing: [...missing]};
}
