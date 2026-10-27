import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildContinuousDocuments} from '../scripts/serve-continuous.mjs';

export async function buildRegionQuestPreview(root = join(process.cwd(), 'src/modules/region-quest')) {
  const [documents, bridge] = await Promise.all([
    buildContinuousDocuments(root),
    readFile(join(root, 'continuous/beta-bridge.js'), 'utf8'),
  ]);
  let html = documents.html;
  for (const [url, asset] of documents.assets) {
    const inline = 'data:' + asset.contentType + ';base64,' + asset.body.toString('base64');
    html = html.replaceAll(JSON.stringify(url), JSON.stringify(inline));
  }
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";
  html = html.replace('<head>', '<head><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="' + policy + '">');
  html = html.replace('<script>globalThis.RQ_DATA=', '<script>' + bridge.replace(/<\/script/gi, '<\\/script') + '</script><script>globalThis.RQ_DATA=');
  return html;
}
