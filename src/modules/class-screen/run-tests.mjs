// Standalone runner: node src/modules/class-screen/run-tests.mjs
import ts from 'typescript';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const p = await import('data:text/javascript;base64,' + Buffer.from(compile('./policy.ts')).toString('base64'));

const bells = p.defaultBells();
// In a period, between periods, before school, after school
assert.deepEqual(p.nowIn(bells, '09:10', 2), {index: 0, label: '1교시', until: 30, next: bells[1], toNext: 40, alert: false});
const gap = p.nowIn(bells, '09:48', 2);
assert.equal(gap.index, -1); assert.equal(gap.label, '쉬는 시간'); assert.equal(gap.toNext, 2); assert.equal(gap.alert, true);
assert.equal(p.nowIn(bells, '09:45', 2).alert, false);
assert.equal(p.nowIn(bells, '09:48', 0).alert, false);
assert.equal(p.nowIn(bells, '08:30', 2).label, '수업 전');
assert.equal(p.nowIn(bells, '08:58', 2).alert, true);
const after = p.nowIn(bells, '15:00', 2);
assert.equal(after.label, '수업 끝'); assert.equal(after.next, null); assert.equal(after.alert, false);
assert.equal(p.nowIn(bells, '09:40', 2).index, -1, 'the end minute belongs to the break');
// Lunch does not count as a teaching period
assert.equal(p.periodNumber(bells, 3), 4); assert.equal(p.periodNumber(bells, 4), 0); assert.equal(p.periodNumber(bells, 5), 5); assert.equal(p.periodNumber(bells, -1), 0);

assert.equal(p.dday('2026-11-25', '2026-11-20'), 'D-5'); assert.equal(p.dday('2026-11-20', '2026-11-20'), 'D-DAY'); assert.equal(p.dday('2026-11-18', '2026-11-20'), 'D+2'); assert.equal(p.dday('', '2026-11-20'), '');
assert.equal(p.clockLabel(185), '03:05');

// Drawing never repeats inside a round and starts a new round when everyone was drawn
let drawn = [];
for (let i = 0; i < 5; i++) drawn = p.draw(5, drawn, () => 0).drawn;
assert.deepEqual([...drawn].sort(), [1, 2, 3, 4, 5]);
assert.deepEqual(p.draw(5, drawn, () => 0).drawn, [1]);
assert.deepEqual(p.draw(3, [9, 2], () => 0), {picked: 1, drawn: [2, 1]});

// Saved state: defaults, round trip, and damaged input
const base = p.defaultState();
assert.equal(base.scenes.length, 4); assert.equal(base.locked, true);
assert.deepEqual(p.parseState(JSON.parse(JSON.stringify(base))), base);
for (const bad of [null, 'x', {}, {v: 2}, {v: 1, scenes: []}]) assert.equal(p.parseState(bad).scenes.length, 4);
const odd = p.parseState({v: 1, active: 'nope', theme: 'x', scale: 9, students: 999, alert: -3, sound: 'yes', locked: false,
  scenes: [{id: 'a', name: '아주아주아주아주아주 긴 이름입니다', cards: [{kind: 'clock', w: 5, h: 7, text: 'a'.repeat(900), date: 'soon', drawn: ['x', 3]}, {kind: 'virus'}]}],
  bells: [{label: '1교시', start: '10:00', end: '09:00'}, {label: '2교시', start: '25:00', end: '26:00'}, {label: '3교시', start: '11:00', end: '11:40'}], subjects: 'x'});
assert.equal(odd.active, 'a'); assert.equal(odd.theme, 'paper'); assert.equal(odd.scale, 1); assert.equal(odd.students, 60); assert.equal(odd.alert, 0); assert.equal(odd.sound, false); assert.equal(odd.locked, false);
assert.equal(odd.scenes[0].name.length, 12); assert.equal(odd.scenes[0].cards.length, 1);
assert.deepEqual([odd.scenes[0].cards[0].w, odd.scenes[0].cards[0].h, odd.scenes[0].cards[0].text.length, odd.scenes[0].cards[0].date, odd.scenes[0].cards[0].drawn], [3, 1, 600, '', [3]]);
assert.deepEqual(odd.bells, [{label: '3교시', start: '11:00', end: '11:40'}]);
assert.deepEqual(odd.subjects, [[], [], [], [], []]);

// The screen keeps everything in the browser: no API route, no Firebase, one storage key.
const screen = readFileSync(new URL('./screen.tsx', import.meta.url), 'utf8');
assert.ok(!/\bfetch\s*\(|['"`]\/api\/|firebase/.test(screen), 'screen.tsx must not call the server directly');
assert.match(screen, /const KEY = 'class-screen:v1'/);
console.log('class-screen tests passed');
