'use client';
import type {PDFDocumentProxy} from 'pdfjs-dist';

/** pdf.js loads only when a PDF is opened; its worker keeps parsing off the main thread. */
let library: Promise<typeof import('pdfjs-dist')> | null = null;
function pdfjs() {
  library ??= import('pdfjs-dist').then(module => {
    if (!module.GlobalWorkerOptions.workerPort) module.GlobalWorkerOptions.workerPort = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), {type: 'module'});
    return module;
  });
  return library;
}

export async function openPdf(data: Blob): Promise<PDFDocumentProxy> {
  const {getDocument} = await pdfjs();
  return getDocument({data: new Uint8Array(await data.arrayBuffer()), enableXfa: false}).promise;
}

/** Text of every page in reading order; an empty string means the page is a picture (scanned). */
export async function pdfPageTexts(doc: PDFDocumentProxy, limit = 300) {
  const texts: string[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, limit); n++) {
    const page = await doc.getPage(n), content = await page.getTextContent();
    let text = '';
    for (const item of content.items) if ('str' in item) text += item.str + (item.hasEOL ? '\n' : '');
    texts.push(text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1200));
    page.cleanup();
  }
  return texts;
}

export async function renderPdfPage(doc: PDFDocumentProxy, number: number, canvas: HTMLCanvasElement, width: number) {
  const page = await doc.getPage(number), base = page.getViewport({scale: 1});
  const ratio = Math.min(2, window.devicePixelRatio || 1), scale = Math.max(0.2, width / base.width);
  const viewport = page.getViewport({scale: scale * ratio});
  canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / ratio)}px`; canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
  const task = page.render({canvas, viewport});
  return {promise: task.promise.finally(() => page.cleanup()), cancel: () => task.cancel()};
}

/** A page as a JPEG data URL, for reading the text of scanned picture books. */
export async function pdfPageImage(doc: PDFDocumentProxy, number: number) {
  const canvas = document.createElement('canvas');
  await (await renderPdfPage(doc, number, canvas, 1400)).promise;
  for (const quality of [0.85, 0.7, 0.55]) {
    const value = canvas.toDataURL('image/jpeg', quality);
    if (value.length <= 1_700_000) return value;
  }
  throw new Error('PAGE_TOO_LARGE');
}
