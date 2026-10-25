import 'server-only';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

// Private source files: only the authorized endpoint can deliver this demo.
// Keep the demo independent of student records, Daily Quiz, and point balances.
const demoRoot = join(process.cwd(), 'src/modules/learning-king/demo');
const imageNames = ['observatory', 'comet', 'moa', 'loop', 'popo', 'crests', 'starlight-arena'] as const;
let documentPromise: Promise<string> | undefined;

async function buildPreview() {
  const [template, model, dashboard, gameplay, gameplayCss, iconMarkup, ...images] = await Promise.all([
    readFile(join(demoRoot, 'dashboard.html'), 'utf8'),
    readFile(join(demoRoot, 'model.js'), 'utf8'),
    readFile(join(demoRoot, 'dashboard.js'), 'utf8'),
    readFile(join(demoRoot, 'gameplay.js'), 'utf8'),
    readFile(join(demoRoot, 'gameplay.css'), 'utf8'),
    readFile(join(demoRoot, 'icons.json'), 'utf8'),
    ...imageNames.map(name => readFile(join(demoRoot, 'assets', name + '.webp'))),
  ]);
  const icons = JSON.stringify(JSON.parse(iconMarkup)).replace(/</g, '\\u003c');
  let fragment = template.replace('__MODEL__', model).replace('__GAMEPLAY__', gameplay).replace('__GAMEPLAY_CSS__', gameplayCss).replace('__UI__', dashboard);
  imageNames.forEach((name, index) => {
    fragment = fragment.replace('__' + name.toUpperCase() + '__', 'data:image/webp;base64,' + images[index].toString('base64'));
  });
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>학습왕 베타 · 예시 데이터</title>
<style>:root{color-scheme:light}body{margin:0;padding:12px;background:#f2f5f1}button{cursor:pointer}button:disabled{cursor:not-allowed}button:focus-visible,summary:focus-visible{outline:3px solid #16766f;outline-offset:3px}@media(max-width:600px){body{padding:6px}}body:has(#solo-hall[data-scene]:not([data-scene="lobby"])){padding:0;background:#112d3c}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}</style>
<script>
const betaIcons=${icons};
globalThis.lucide={createIcons(){document.querySelectorAll('[data-lucide]').forEach(node=>{const svg=betaIcons[node.getAttribute('data-lucide')];if(svg)node.outerHTML=svg;});}};
window.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();parent.postMessage({type:'learning-king-beta-close'},'*');}});
</script></head><body>${fragment}</body></html>`;
}

export function loadLearningKingPreview(): Promise<string> {
  // Cache only immutable demo source; authorization still runs on every request.
  documentPromise ??= buildPreview().catch(error => {documentPromise = undefined; throw error;});
  return documentPromise;
}
