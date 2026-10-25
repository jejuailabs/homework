import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

test('학습왕 beta assembles a complete private document with working inline code and icons', async () => {
  const source = fs.readFileSync(new URL('./server/preview.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/import\s+['"]server-only['"];?/, '');
  const { loadLearningKingPreview } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const html = await loadLearningKingPreview();

  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<title>학습왕 베타 · 예시 데이터<\/title>/);
  assert.doesNotMatch(html, /__[A-Z][A-Z0-9_]*__/, 'all template placeholders must resolve');
  assert.doesNotMatch(html, /(?:window|globalThis)\.openai\b|openai:set_globals|setWidgetState|widgetState/, 'the embedded beta must run without the preview host');

  const policy = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];
  assert.ok(policy, 'the actual document must declare its CSP');
  assert.match(policy, /(?:^|;)\s*connect-src 'none'(?:;|$)/);
  assert.match(policy, /(?:^|;)\s*img-src data:(?:;|$)/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i, 'scripts must not load from another service');

  const embeddedImages = [...html.matchAll(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/g)];
  assert.equal(embeddedImages.length, 6);
  for (const [index, name] of ['observatory', 'comet', 'moa', 'loop', 'popo', 'crests'].entries()) {
    const actual = Buffer.from(embeddedImages[index][1], 'base64');
    const expected = fs.readFileSync(new URL(`./demo/assets/${name}.webp`, import.meta.url));
    assert.ok(actual.equals(expected), `${name} image must survive assembly unchanged`);
    assert.equal(actual.subarray(0, 4).toString(), 'RIFF');
    assert.equal(actual.subarray(8, 12).toString(), 'WEBP');
  }

  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  assert.ok(scripts.length >= 2, 'icon bootstrap and dashboard scripts must exist');
  for (const [index, script] of scripts.entries()) {
    assert.doesNotThrow(() => new vm.Script(script[1], { filename: `learning-king-inline-${index}.js` }));
  }

  const iconExpression = scripts[0][1].match(/^const betaIcons=(.+);$/m)?.[1];
  assert.ok(iconExpression, 'embedded icon data must be available to the bootstrap');
  assert.doesNotMatch(iconExpression, /</, 'raw SVG markup must be escaped in JavaScript');
  const icons = vm.runInNewContext(`(${iconExpression})`, {}, { timeout: 1000 });
  const originalIcons = JSON.parse(fs.readFileSync(new URL('./demo/icons.json', import.meta.url), 'utf8'));
  assert.equal(JSON.stringify(icons), JSON.stringify(originalIcons), 'Unicode escaping must decode into the original SVG strings');
  assert.ok(Object.keys(icons).length > 0);
  for (const [name, svg] of Object.entries(icons)) {
    assert.match(svg, /^<svg\b/, `${name} must decode into SVG markup`);
    assert.match(svg, /<\/svg>$/);
  }
});
