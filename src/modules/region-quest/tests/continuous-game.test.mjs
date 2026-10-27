import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../continuous/game.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../continuous/game.html', import.meta.url), 'utf8');
const saveKey = 'region-quest-aewol-continuous-v1';

// Run the real event/save/frame code without a browser or image/network fetches.
// Terrain collision is exercised separately by continuous-motion/world tests.
async function boot(saved) {
  let clock = 0;
  const frames = [], storage = new Map(saved ? [[saveKey, JSON.stringify(saved)]] : []), listeners = new Map();
  const context = new Proxy({}, {get(target, key) {
    if (key === 'measureText') return text => ({width: text.length * 6});
    if (key === 'createLinearGradient') return () => ({addColorStop() {}});
    if (key === 'createPattern') return () => ({});
    return target[key] ?? (() => {});
  }});
  class Element {
    constructor(tag = 'div') {this.tagName = tag;this.children = [];this.style = {};this.dataset = {};this.attributes = {};this.events = new Map();this.parts = new Map();this.open = false;this.width = 1200;this.height = 720;this.classList = {add() {}, remove() {}};}
    append(...children) {this.children.push(...children);}
    replaceChildren(...children) {this.children = children;}
    get firstElementChild() {return this.children[0];}
    querySelector(selector) {if (!this.parts.has(selector)) this.parts.set(selector, new Element());return this.parts.get(selector);}
    setAttribute(key, value) {this.attributes[key] = value;}
    addEventListener(name, fn) {this.events.set(name, fn);}
    showModal() {this.open = true;}
    close() {this.open = false;queueMicrotask(() => this.events.get('close')?.());}
    focus() {}
    remove() {this.removed = true;}
    getContext() {return context;}
    getBoundingClientRect() {return {left: 0, top: 0, width: this.width, height: this.height};}
  }
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element()]));
  const world = {width: 1200, height: 1200, spawn: {x: 300, y: 500}};
  const stops = [{id: 'school', point: world.spawn}, {id: 'bend', point: {x: 650, y: 500}}, {id: 'coast', point: {x: 1000, y: 500}}];
  const assets = Object.fromEntries(['player','guide','carDown','carLeft','carRight','carUp'].map(name => [name, name]));
  const globals = {
    ContinuousWorld: {world, roads: [], route: stops.map(s => s.point), stops, objects: [], landmarks: [], sea: [], scale: 6, npcs: [{id: 'school', name: '모모', point: {x: 180, y: 550}, target: world.spawn}]},
    ContinuousMotion: {
      isWalkable: p => Boolean(p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0),
      nearestWalkable: p => ({...p}),
      findPath: (from, to) => [{...to}], findRoadPath: (from, to) => [{...to}],
      move: (p, d) => ({x: p.x + d.x, y: p.y + d.y}),
      cameraFor: () => ({x: 0, y: 0})
    },
    RQ_ASSETS: assets, devicePixelRatio: 1,
    document: {getElementById: id => elements.get(id), createElement: tag => new Element(tag), querySelectorAll: () => [], addEventListener() {}},
    window: {addEventListener: (event, fn) => listeners.set(event, fn)},
    localStorage: {getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v)},
    matchMedia: () => ({matches: true}), performance: {now: () => clock},
    requestAnimationFrame: fn => frames.push(fn),
    setTimeout: () => 1, clearTimeout() {},
    ResizeObserver: class {observe() {}},
    Image: class {constructor() {this.width = 160;this.height = 200;}set src(value) {this.url = value;queueMicrotask(() => this.onload());}}
  };
  vm.runInNewContext(source, globals);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.get('loading').removed, true, 'game initializes successfully');
  const fire = (type, key, repeat = false) => listeners.get(type)?.({key, repeat, preventDefault() {}});
  return {
    elements, storage,
    state: () => JSON.parse(storage.get(saveKey)),
    keyDown: key => fire('keydown', key), keyUp: key => fire('keyup', key),
    step(ms = 40) {clock += ms;frames.shift()(clock);},
    flush: () => new Promise(resolve => setImmediate(resolve))
  };
}

test('old saves remain walking and a selected car survives save/reload', async () => {
  const old = {v: 1, phase: 'bend', position: {x: 380, y: 450}, facing: 'left', resume: null};
  const app = await boot(old);
  assert.equal(app.elements.get('vehicle').attributes['aria-pressed'], 'false');
  app.elements.get('vehicle').onclick();
  assert.equal(app.state().phase, 'bend');
  assert.equal(app.state().position.x, 380);
  assert.equal(app.state().travelMode, 'car');
  const restored = await boot(app.state());
  assert.equal(restored.elements.get('vehicle').attributes['aria-pressed'], 'true');
  restored.keyDown('v');
  assert.equal(restored.state().travelMode, 'walk');
});

test('the same held movement covers three times the distance in car mode', async () => {
  const app = await boot();
  app.keyDown('ArrowRight');app.step();app.keyUp('ArrowRight');
  const walkingDistance = app.state().position.x - 300;
  app.keyDown('v');
  const start = app.state().position.x;
  app.keyDown('ArrowRight');app.step();app.keyUp('ArrowRight');
  assert.ok(walkingDistance > 0);
  assert.ok(Math.abs((app.state().position.x - start) / walkingDistance - 3) < 1e-9);
});

test('dialog keys cannot switch vehicles and map navigation survives its asynchronous close event', async () => {
  const app = await boot();
  app.keyDown('v');
  app.keyDown('e');
  assert.equal(app.elements.get('dialog').open, true);
  app.keyDown('v');
  assert.equal(app.state().travelMode, 'car');
  app.elements.get('close-dialog').onclick();await app.flush();
  app.elements.get('map-button').onclick();
  const map = app.elements.get('panel-content').children.find(c => c.tagName === 'canvas');
  assert.ok(map);
  map.onclick({clientX: 600, clientY: 300});
  await app.flush();
  const start = app.state().position;
  app.step();app.keyUp('ArrowRight');
  const end = app.state();
  assert.equal(end.travelMode, 'car');
  assert.ok(Math.hypot(end.position.x - start.x, end.position.y - start.y) > 20, 'map destination still moves after close');
});
