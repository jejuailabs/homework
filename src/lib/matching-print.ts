import {matchingPositions, type MatchingSettings} from './matching-deck';
import type {MatchingAsset} from './matching-assets';

const escape = (text: string) => text.replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]!));

/** A separate document prevents app headers, teacher names and unrelated panels from printing. */
export function printMatchingDeck(settings: MatchingSettings, cards: number[][], assets: MatchingAsset[], locale: string) {
  const popup = window.open('', '_blank', 'width=1050,height=850');
  if (!popup) return false;
  const en = locale === 'en';
  const positions = matchingPositions(settings.symbolsPerCard);
  const shape = settings.shape;
  const outline = shape === 'hexagon' ? '<polygon points="50,1 92.44,25.5 92.44,74.5 50,99 7.56,74.5 7.56,25.5"/>' : shape === 'circle' ? '<circle cx="50" cy="50" r="48"/>' : '<rect x="2" y="2" width="96" height="96" rx="4"/>';
  const sheets = Array.from({length: Math.ceil(cards.length / 6)}, (_, page) => `<section class="sheet"><header><strong>${escape(settings.title || (en ? 'Find the same picture' : '같은 그림 찾기'))}</strong><span>${page + 1} / ${Math.ceil(cards.length / 6)}</span></header><main>${cards.slice(page * 6, page * 6 + 6).map((card, index) => `<article><div class="card"><svg class="outline" viewBox="0 0 100 100">${outline}</svg>${card.map((id, slot) => {
    const asset = assets[id], position = positions[slot];
    const name = en ? asset.en : asset.ko;
    return `<div class="symbol" style="left:${position.x}%;top:${position.y}%;width:${position.size}%"><img alt="${escape(name)}" data-picture="${escape(new URL(asset.src, window.location.origin).href)}">${settings.labels ? `<small>${escape(name)}</small>` : ''}</div>`;
  }).join('')}</div><span class="number">${page * 6 + index + 1}</span></article>`).join('')}</main><footer>${en ? 'Cut along the outlines. Every two cards share exactly one picture.' : '테두리를 따라 잘라 주세요. 어떤 두 카드도 같은 그림이 하나입니다.'}<br>${settings.pack === 'flags' ? 'flag-icons © Panayiotis Lipiridis and contributors · MIT · github.com/lipis/flag-icons' : 'Noto Emoji © Google · Apache-2.0 · github.com/googlefonts/noto-emoji'}</footer></section>`).join('');
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="${en ? 'en' : 'ko'}"><head><meta charset="utf-8"><title>${escape(settings.title || '같은 그림 찾기')}</title><style>*{box-sizing:border-box}body{margin:0;background:#e6e8e5;color:#26382f;font-family:Arial,"Malgun Gothic",sans-serif}.toolbar{padding:18px;text-align:center;position:sticky;top:0;background:white;z-index:10}.toolbar button{padding:10px 20px;border:0;border-radius:10px;background:#385d4a;color:white;font-size:15px;cursor:pointer}.toolbar p{font-size:12px}.sheet{background:white;width:190mm;height:277mm;padding:4mm;margin:10mm auto;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}header{height:12mm;display:flex;justify-content:space-between;font-size:11px}main{display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(3,80mm);gap:1mm 4mm}article{position:relative;display:grid;place-items:center}.card{height:74mm;width:74mm;position:relative}.outline{position:absolute;inset:0;width:100%;height:100%;fill:white;stroke:#8c9b91;stroke-width:.45;stroke-dasharray:1.5 1}.symbol{position:absolute;transform:translate(-50%,-50%);text-align:center;line-height:1}.symbol img{width:100%;height:auto;aspect-ratio:1;object-fit:contain;display:block}.symbol small{display:block;font-size:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.number{position:absolute;bottom:0;right:7mm;font-size:9px;color:#718078}footer{text-align:center;font-size:7px;line-height:1.7;padding-top:3mm}@page{size:A4 portrait;margin:10mm}@media print{body{background:white}.toolbar{display:none}.sheet{margin:0;width:190mm;height:277mm;box-shadow:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class="toolbar"><button id="print" disabled>${en ? 'Loading pictures…' : '그림을 불러오는 중…'}</button><p id="hint">${en ? 'A4 · Portrait · Scale 100% · Turn off browser headers and footers. Choose Save as PDF to download.' : 'A4 · 세로 · 배율 100% · 브라우저 머리글/바닥글 끄기. 대상에서 PDF로 저장을 선택하면 내려받을 수 있어요.'}</p></div>${sheets}</body></html>`);
  popup.document.close();
  popup.opener = null;
  const images = Array.from(popup.document.images);
  // Resolve artwork in the opening page and embed it, so the print document has
  // no network dependency after preparation (including browser popup isolation).
  const loadImages = async () => {
    const urls = [...new Set(images.map(image => image.dataset.picture!))];
    const entries = await Promise.all(urls.map(async url => {
      const response = await fetch(url, {signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('image');
      const svg = await response.text();
      if (!svg.includes('<svg')) throw new Error('image');
      return [url, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`] as const;
    }));
    const data = new Map(entries);
    await Promise.all(images.map(image => {
      image.src = data.get(image.dataset.picture!)!;
      return image.decode();
    }));
  };
  loadImages().then(() => {
    const button = popup.document.getElementById('print') as HTMLButtonElement | null;
    if (!button) return;
    button.disabled = false; button.textContent = en ? 'Print / Save as PDF' : '인쇄 / PDF로 저장';
    button.addEventListener('click', () => popup.print());
  }).catch(() => {
    const hint = popup.document.getElementById('hint');
    if (hint) hint.textContent = en ? 'Some pictures could not load. Close this window and try again.' : '일부 그림을 불러오지 못했어요. 창을 닫고 다시 인쇄해 주세요.';
  });
  return true;
}
