import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync, readdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

// Local-only ESM loader: no Firebase, browser, credentials or external services are involved.
const base = dirname(fileURLToPath(import.meta.url)), root = resolve(base, '../../..'), cache = new Map();
function moduleUrl(file) {
  if (cache.has(file)) return cache.get(file);
  let code = ts.transpileModule(readFileSync(file, 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
  for (const {fileName: name} of ts.preProcessFile(code).importedFiles) {
    const replacement = name.startsWith('.') ? moduleUrl(resolve(dirname(file), `${name}.ts`))
      : name.startsWith('@/') ? moduleUrl(resolve(root, 'src', `${name.slice(2)}.ts`)) : import.meta.resolve(name);
    code = code.replaceAll(`'${name}'`, JSON.stringify(replacement)).replaceAll(`"${name}"`, JSON.stringify(replacement));
  }
  const result = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  cache.set(file, result); return result;
}

const backup = await import(moduleUrl(resolve(base, 'diary-backup.ts')));
const {diaryTextLines, diaryTextBoxOutsidePage, exportDiaryPdf} = await import(moduleUrl(resolve(base, 'diary-export.ts')));
const {diaryStickers, moodStickers, defaultDiaryStickers, shopDiaryStickers} = await import(moduleUrl(resolve(base, 'diary-stickers.ts')));
const {validateDiary} = await import(moduleUrl(resolve(base, 'policy.ts')));
const {starterSpaceIds} = await import(moduleUrl(resolve(base, 'catalog.ts')));
const password = 'test-only diary backup password';
const page = {
  id: 'sample-page', schemaVersion: 2, version: 4, updatedAt: '2026-10-27T03:00:00.000Z', date: '2026-10-27',
  title: '아무도 모르는 오늘', paper: 'paper-cream', mood: 'calm',
  layers: [
    {id: 'text-1', itemId: '', kind: 'text', text: '  오늘은 기분이 좋아요.\n\n친구와 놀았어요. ', fontSize: 24, align: 'left', color: '#355147', x: 50, y: 40, size: 70, rotation: -5, flip: false},
    {id: 'sticker-1', itemId: 'diary-rabbit', kind: 'sticker', x: 75, y: 65, size: 20, rotation: 10, flip: true},
    {id: 'ink-1', itemId: '', kind: 'ink', x: 50, y: 50, size: 100, rotation: 0, flip: false, points: [[40, 50, .2], [70, 90, .8]], brush: 'pen', color: '#a75876', width: 4, opacity: 1},
  ],
};
let encrypted;

test('26 original sticker assets have unique immutable IDs, exact free/paid counts and no external content', () => {
  assert.equal(moodStickers.length, 6); assert.equal(defaultDiaryStickers.length, 10); assert.equal(shopDiaryStickers.length, 10);
  assert.equal(new Set(diaryStickers.map(item => item.id)).size, 26);
  for (const item of diaryStickers) {
    assert.equal(item.kind, 'sticker');
    assert.equal(item.art, `/diary/v1/${item.id}.svg`);
    assert(item.price === 0 || item.price === 5 || item.price === 10);
    const svg = readFileSync(resolve(root, `public${item.art}`), 'utf8');
    assert.match(svg, /viewBox="0 0 160 160"/);
    assert.match(svg, /feMorphology/);
    assert(!/<script|<foreignObject|href=|url\(https?:|<image/i.test(svg));
  }
  assert.equal(readdirSync(resolve(root, 'public/diary/v1')).filter(name => name.endsWith('.svg')).length, 26);
});

test('encrypted portable backup keeps text, whitespace, mood, placement and ink; no plaintext content leaks', async () => {
  encrypted = await backup.createDiaryBackup([page], password);
  assert(!encrypted.includes(page.title)); assert(!encrypted.includes('친구')); assert(!encrypted.includes('diary-rabbit'));
  const opened = await backup.readDiaryBackup(encrypted, password);
  assert.equal(opened.pages.length, 1);
  assert.deepEqual(opened.pages[0], page);
  const again = await backup.createDiaryBackup([page], password);
  assert.notEqual(encrypted, again, 'each backup requires a fresh salt and IV');
});

test('wrong password and ciphertext tampering fail authentication without returning partial content', async () => {
  const source = encrypted || await backup.createDiaryBackup([page], password);
  await assert.rejects(backup.readDiaryBackup(source, 'wrong password'), /암호가 다르거나/);
  const damaged = JSON.parse(source); damaged.ciphertext = (damaged.ciphertext[0] === 'A' ? 'B' : 'A') + damaged.ciphertext.slice(1);
  await assert.rejects(backup.readDiaryBackup(JSON.stringify(damaged), password), /암호가 다르거나/);
});

test('untrusted KDF work factors, future formats and malformed salts are rejected before decryption', async () => {
  const source = JSON.parse(encrypted || await backup.createDiaryBackup([page], password));
  await assert.rejects(backup.readDiaryBackup(JSON.stringify({...source, version: 9}), password), /지원하지 않는/);
  await assert.rejects(backup.readDiaryBackup(JSON.stringify({...source, kdf: {...source.kdf, iterations: 999999999}}), password), /지원하지 않는/);
  await assert.rejects(backup.readDiaryBackup(JSON.stringify({...source, kdf: {...source.kdf, salt: 'AAAA'}}), password), /손상/);
  await assert.rejects(backup.createDiaryBackup([page], '123456'), /8~200/);
});

test('imports always use fresh page IDs and version zero; imported points cannot alias the backup object', async () => {
  const opened = await backup.readDiaryBackup(encrypted || await backup.createDiaryBackup([page], password), password);
  const first = backup.freshImportedPages(opened), second = backup.freshImportedPages(opened);
  assert.notEqual(first[0].id, page.id); assert.notEqual(first[0].id, second[0].id);
  assert.equal(first[0].version, 0); assert.equal(first[0].updatedAt, '');
  first[0].layers[2].points[0][0] = 999;
  assert.equal(opened.pages[0].layers[2].points[0][0], 40);
});

test('attachment backups fail explicitly instead of making an unusable archive; paid ownership still checked on save', async () => {
  const photo = {...page, layers: [{...page.layers[1], kind: 'photo', itemId: '', assetId: 'photo1'}]};
  await assert.rejects(backup.createDiaryBackup([photo], password), /PDF로/);
  const paid = {...page, layers: [{...page.layers[1], itemId: 'diary-cake'}]};
  const opened = await backup.readDiaryBackup(await backup.createDiaryBackup([paid], password), password);
  assert.throws(() => validateDiary(opened.pages[0], starterSpaceIds), /보관함/);
  assert.throws(() => backup.freshImportedPages({...opened, pages: [page, page]}), /일기 번호/);
  assert.throws(() => backup.freshImportedPages({...opened, pages: [{...page, schemaVersion: 99}]}), /지원하지/);
});

test('PDF text wrapping keeps Hangul, blank lines, indentation and whole emoji graphemes', () => {
  assert.deepEqual(diaryTextLines('가나다라\n\n  끝 ', 2, text => [...text].length), ['가나', '다라', '', '  ', '끝 ']);
  const family = '👨‍👩‍👧‍👦';
  assert.deepEqual(diaryTextLines(`${family}${family}`, 1, text => [...new Intl.Segmenter('ko', {granularity: 'grapheme'}).segment(text)].length), [family, family]);
  assert.deepEqual(diaryTextLines('', 100, text => text.length), ['']);
});

test('a locked or unmounted diary cannot finish PDF or backup work', async () => {
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(exportDiaryPdf([page], 'test.pdf', cancelled.signal), {name: 'AbortError'});
  await assert.rejects(backup.createDiaryBackup([page], password, cancelled.signal), {name: 'AbortError'});
  await assert.rejects(backup.readDiaryBackup(encrypted, password, cancelled.signal), {name: 'AbortError'});
  const duringEncryption = new AbortController();
  const work = backup.createDiaryBackup([page], password, duringEncryption.signal);
  duringEncryption.abort();
  await assert.rejects(work, {name: 'AbortError'});
});

test('PDF refuses silently cropped text, including long centred text and rotation beyond the paper edge', () => {
  const centred = {x: 50, y: 50, size: 70, rotation: 0};
  assert.equal(diaryTextBoxOutsidePage(centred, 400), false);
  assert.equal(diaryTextBoxOutsidePage(centred, 961), true);
  assert.equal(diaryTextBoxOutsidePage({...centred, y: 5}, 120), true);
  assert.equal(diaryTextBoxOutsidePage({...centred, x: 5}, 100), true);
  assert.equal(diaryTextBoxOutsidePage({...centred, size: 100}, 960), false);
  assert.equal(diaryTextBoxOutsidePage({...centred, size: 100, rotation: 1}, 960), true);
  assert.equal(diaryTextBoxOutsidePage({...centred, size: 80, rotation: 90}, 800), true);
  assert.equal(diaryTextBoxOutsidePage({...centred, rotation: 180}, 400), false);
  assert.equal(diaryTextBoxOutsidePage(centred, Number.NaN), true);
});
