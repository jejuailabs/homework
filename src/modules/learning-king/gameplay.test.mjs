import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const modelSource = fs.readFileSync(new URL('./demo/model.js', import.meta.url), 'utf8');
const gameplaySource = fs.readFileSync(new URL('./demo/gameplay.js', import.meta.url), 'utf8');
const dashboardSource = fs.readFileSync(new URL('./demo/dashboard.js', import.meta.url), 'utf8');
const decode = value => value.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[entity]);

// The production event handler and renderer run unchanged. This small DOM adapter
// records generated markup; layout and focus appearance remain browser QA checks.
function createGame() {
  let now = Date.parse('2026-10-25T00:00:00Z');
  let nextTimer = 1;
  const timers = new Map();
  const listeners = new Map();
  const scores = [];
  const nodes = new Map();
  const node = () => ({
    dataset: {}, style: { setProperty() {} }, textContent: '', hidden: false,
    scrollIntoView() {}, focus() {}, setAttribute(name, value) { this[name] = String(value); },
    classList: { add() {}, remove() {}, toggle() {} },
  });
  const main = { innerHTML: '' };
  const root = {
    ...node(),
    addEventListener(type, listener) { listeners.set(type, listener); },
    contains(button) { return button.owner === root; },
    querySelector(selector) {
      if (selector === '[data-dashboard]') return main;
      if (!nodes.has(selector)) nodes.set(selector, node());
      return nodes.get(selector);
    },
    querySelectorAll(selector) {
      if (selector === '[data-answer]') return buttons().filter(button => button.hasAttribute('data-answer'));
      return [];
    },
  };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  function schedule(callback, delay, repeat = false) {
    const id = nextTimer++;
    timers.set(id, { callback, at: now + Math.max(0, Number(delay) || 0), delay: Math.max(1, Number(delay) || 0), repeat });
    return id;
  }
  const context = vm.createContext({
    Date: ClockDate,
    document: { getElementById: id => id === 'solo-hall' ? root : null },
    window: { scrollTo() {} },
    setTimeout: (callback, delay) => schedule(callback, delay),
    clearTimeout: id => timers.delete(id),
    setInterval: (callback, delay) => schedule(callback, delay, true),
    clearInterval: id => timers.delete(id),
    requestAnimationFrame: callback => schedule(() => callback(now), 16),
    cancelAnimationFrame: id => timers.delete(id),
    matchMedia: () => ({ matches: true }),
    console,
  });
  vm.runInContext(modelSource, context);
  vm.runInContext(gameplaySource, context);
  const originalScore = context.SoloRank.score;
  context.SoloRank.score = answers => {
    const result = originalScore(answers);
    scores.push(JSON.parse(JSON.stringify(result)));
    return result;
  };
  vm.runInContext(dashboardSource, context);

  function advance(milliseconds) {
    const until = now + milliseconds;
    for (let count = 0; count < 100000; count += 1) {
      const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) { now = until; return; }
      const [id, timer] = next;
      now = timer.at;
      if (timer.repeat) timer.at += timer.delay;
      else timers.delete(id);
      timer.callback();
    }
    throw new Error('The game scheduled an unbounded timer loop');
  }
  function buttons() {
    return [...main.innerHTML.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, source, label]) => {
      const attrs = Object.fromEntries([...source.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, name, value]) => [name, decode(value ?? '')]));
      return {
        owner: root, label: decode(label.replace(/<[^>]*>/g, '')), disabled: Object.hasOwn(attrs, 'disabled'),
        attrs, dataset: Object.fromEntries(Object.entries(attrs).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase()), value])),
        hasAttribute: name => Object.hasOwn(attrs, name),
        closest() { return this; },
        click() { listeners.get('click')({ target: this }); },
      };
    });
  }
  function getButton(attribute, value) {
    const result = buttons().find(button => button.hasAttribute(attribute) && (value === undefined || button.attrs[attribute] === value));
    assert.ok(result, `Expected a visible button ${attribute}${value === undefined ? '' : `="${value}"`} in scene ${root.dataset.scene}`);
    return result;
  }
  function click(target, value) {
    const button = typeof target === 'string' ? getButton(target, value) : target;
    listeners.get('click')({ target: button });
  }
  function begin(subject = 'math') {
    if (subject !== 'math') click('data-subject', subject);
    click('data-start');
    assert.equal(root.dataset.scene, 'countdown');
    const startedAt = now;
    while (root.dataset.scene === 'countdown' && now - startedAt < 4000) advance(10);
    assert.equal(root.dataset.scene, 'playing');
    assert.ok(now - startedAt >= 3000, 'the full preparation countdown must run before a question is timed');
  }
  function press(key, extra = {}) {
    assert.ok(listeners.has('keydown'), 'the advertised number shortcuts must have a handler');
    listeners.get('keydown')({ key, repeat: false, ctrlKey: false, altKey: false, metaKey: false,
      target: { tagName: 'BUTTON', closest: () => null }, preventDefault() {}, ...extra });
  }
  return {
    root, scores, advance, click, press, getButton, begin, model: context.SoloRank,
    get html() { return main.innerHTML; },
    get latestScore() { return scores.at(-1); },
  };
}

function assertNoRankings(game) {
  assert.doesNotMatch(game.html, /data-rankings|class="sh-board(?:\s|"|-head)|우리의 여섯 가지 리그/,
    'rankings must be absent from the rendered scene, not merely hidden behind the question');
}

function finishCorrectly(game, subject = 'math', delay = 1000) {
  for (const question of game.model.questions[subject]) {
    game.advance(delay);
    game.click('data-answer', question.correct);
  }
  assert.equal(game.root.dataset.scene, 'result');
}

test('the solo game replaces lobby rankings through countdown, play and results until explicit return', () => {
  const game = createGame();
  assert.equal(game.root.dataset.scene, 'lobby');
  assert.equal((game.html.match(/class="sh-board(?:\s[^"]*)?"/g) ?? []).length, 6);
  game.click('data-start');
  assert.equal(game.root.dataset.scene, 'countdown');
  assertNoRankings(game);
  assert.doesNotMatch(game.html, /data-answer=/, 'answers must not appear before the countdown completes');
  game.advance(3000);
  assert.equal(game.root.dataset.scene, 'playing');
  assertNoRankings(game);
  finishCorrectly(game);
  assertNoRankings(game);
  game.click('data-see-ranks');
  assert.equal(game.root.dataset.scene, 'lobby');
  assert.equal((game.html.match(/class="sh-board(?:\s[^"]*)?"/g) ?? []).length, 6);
});

test('timed answers exclude preparation and reject rapid or stale question submissions', () => {
  const game = createGame();
  game.begin();
  const questions = game.model.questions.math;
  const first = game.getButton('data-answer', questions[0].correct);
  game.advance(1000);
  game.click(first);
  const second = game.getButton('data-answer', questions[1].correct);
  game.click(second);
  assert.equal(game.getButton('data-answer', questions[1].correct).dataset.questionId, questions[1].id);
  game.advance(1000);
  game.click(first);
  assert.equal(game.getButton('data-answer', questions[1].correct).dataset.questionId, questions[1].id);
  game.click(second);
  for (const question of questions.slice(2)) {
    game.advance(1000);
    game.click('data-answer', question.correct);
  }
  assert.equal(game.root.dataset.scene, 'result');
  assert.equal(game.latestScore.correct, 5);
  assert.equal(game.latestScore.totalSeconds, 5, '3 seconds of preparation and rejected clicks must not add answer time');
  assert.equal(game.latestScore.score, 1000);
});

for (const cancelScene of ['countdown', 'playing']) {
  test(`cancelling during ${cancelScene} returns to the lobby without later ghost questions or results`, () => {
    const game = createGame();
    if (cancelScene === 'playing') game.begin();
    else game.click('data-start');
    game.click('data-cancel');
    assert.equal(game.root.dataset.scene, 'lobby');
    const scoreCount = game.scores.length;
    game.advance(130000);
    assert.equal(game.root.dataset.scene, 'lobby');
    assert.equal(game.scores.length, scoreCount, 'an abandoned run must never publish a score');
    game.begin();
    finishCorrectly(game);
    assert.equal(game.latestScore.totalSeconds, 5, 'a new run gets fresh question timing after cancellation');
  });
}

test('time limit produces one result with unanswered items and never restores rankings automatically', () => {
  const game = createGame();
  game.begin();
  game.advance(120000);
  assert.equal(game.root.dataset.scene, 'result');
  assertNoRankings(game);
  assert.equal(game.latestScore.correct, 0);
  assert.equal(game.latestScore.score, 0);
  assert.equal(game.latestScore.totalSeconds, 120);
  assert.equal(game.latestScore.answers.length, 5);
  const result = game.html;
  game.advance(60000);
  assert.equal(game.root.dataset.scene, 'result');
  assert.equal(game.html, result, 'later timer ticks must not repeat completion or alter the result');
});

test('English run keeps explanations for the result and supports a clean replay', () => {
  const game = createGame();
  game.begin('english');
  for (const question of game.model.questions.english) {
    assertNoRankings(game);
    assert.ok(!game.html.includes(question.explanation), 'the solution must not be exposed in the question scene');
    game.advance(1000);
    game.click('data-answer', question.correct);
  }
  assert.equal(game.root.dataset.scene, 'result');
  assert.equal(game.latestScore.correct, 5);
  for (const question of game.model.questions.english) assert.ok(game.html.includes(question.explanation));
  game.click('data-start');
  assert.equal(game.root.dataset.scene, 'countdown');
  assertNoRankings(game);
  game.advance(3000);
  assert.equal(game.getButton('data-answer', game.model.questions.english[0].correct).dataset.questionId, 'solo-e1');
});

test('number shortcuts answer the current question once and ignore held or modified keys', () => {
  const game = createGame();
  game.begin();
  for (const question of game.model.questions.math) {
    game.advance(1000);
    const key = String(question.answers.indexOf(question.correct) + 1);
    game.press(key, { repeat: true });
    game.press(key, { ctrlKey: true });
    assert.equal(game.getButton('data-answer', question.correct).dataset.questionId, question.id);
    game.press(key);
  }
  assert.equal(game.root.dataset.scene, 'result');
  assert.equal(game.latestScore.correct, 5);
  assert.equal(game.latestScore.totalSeconds, 5);
});
