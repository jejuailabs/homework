import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const modelSource = fs.readFileSync(new URL('./demo/model.js', import.meta.url), 'utf8');
const journeySource = fs.readFileSync(new URL('./demo/math-journey.js', import.meta.url), 'utf8');
const gameplaySource = fs.readFileSync(new URL('./demo/gameplay.js', import.meta.url), 'utf8');
const dashboardSource = fs.readFileSync(new URL('./demo/dashboard.js', import.meta.url), 'utf8');
const decode = value => value.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[entity]);

// The production event handler and renderer run unchanged. This small DOM adapter
// records generated markup; layout and focus appearance remain browser QA checks.
function createGame({storedState = null, autoLoad = true, available = true} = {}) {
  let now = Date.parse('2026-10-25T00:00:00Z');
  let nextTimer = 1;
  const timers = new Map();
  const listeners = new Map();
  const windowListeners = new Map();
  const scores = [];
  const journeyScores = [];
  const generated = [];
  const saves = [];
  const messages = [];
  const clone = value => JSON.parse(JSON.stringify(value));
  let persisted = clone(storedState);
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
  const parent = {
    postMessage(message) {
      const copy = clone(message);
      messages.push(copy);
      if (copy.type === 'learning-king-journey-load' && autoLoad) {
        schedule(() => deliver({type: 'learning-king-journey-state', state: clone(persisted), available}), 0);
      }
      if (copy.type === 'learning-king-journey-save') {
        saves.push(copy.state);
        if (available) persisted = clone(copy.state);
        schedule(() => deliver({type: 'learning-king-journey-saved', ok: available}), 0);
      }
    },
  };
  function deliver(data, source = parent) {
    windowListeners.get('message')?.({data: clone(data), source});
  }
  const context = vm.createContext({
    Date: ClockDate,
    document: { getElementById: id => id === 'solo-hall' ? root : null },
    window: {parent, scrollTo() {}, addEventListener(type, listener) { windowListeners.set(type, listener); }},
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
  vm.runInContext(journeySource, context);
  vm.runInContext(gameplaySource, context);
  const originalScore = context.SoloRank.score;
  context.SoloRank.score = answers => {
    const result = originalScore(answers);
    scores.push(JSON.parse(JSON.stringify(result)));
    return result;
  };
  const journeyModel = context.MathJourney;
  context.MathJourney = {
    ...journeyModel,
    generate(input) {
      const result = journeyModel.generate(input);
      generated.push(clone(result));
      return result;
    },
    score(input, total) {
      const result = journeyModel.score(input, total);
      journeyScores.push(clone(result));
      return result;
    },
  };
  vm.runInContext(dashboardSource, context);
  advance(0);

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
  function begin(subject = 'english') {
    click('data-subject', subject);
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
    root, scores, journeyScores, saves, messages, generated, advance, click, press, getButton, begin, model: context.SoloRank,
    deliver, deliverSavedState() { deliver({type: 'learning-king-journey-state', state: clone(persisted), available}); },
    pagehide() { windowListeners.get('pagehide')?.(); },
    get storedState() { return clone(persisted); },
    get latestSave() { return clone(saves.at(-1)); },
    get latestJourneyScore() { return journeyScores.at(-1); },
    get mathQuestions() { return clone(generated.at(-1)?.questions || persisted?.active?.questions || []); },
    get clock() { return nodes.get('[data-clock]')?.textContent; },
    get html() { return main.innerHTML; },
    get latestScore() { return scores.at(-1); },
  };
}

function assertNoRankings(game) {
  assert.doesNotMatch(game.html, /data-rankings|class="sh-board(?:\s|"|-head)|우리의 여섯 가지 리그/,
    'rankings must be absent from the rendered scene, not merely hidden behind the question');
}

function finishCorrectly(game, subject = 'english', delay = 1000) {
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
  game.click('data-subject', 'english');
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
  const questions = game.model.questions.english;
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
    else { game.click('data-subject', 'english'); game.click('data-start'); }
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
  for (const question of game.model.questions.english) {
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

test('math journey prepares twenty real questions and remains playable beyond the English time limit', () => {
  const game = createGame();
  game.click('data-start');
  assert.equal(game.root.dataset.scene, 'countdown');
  assertNoRankings(game);
  assert.doesNotMatch(game.html, /data-answer=/);
  assert.equal(game.latestSave.active.questions.length, 20);
  assert.equal(game.latestSave.bank.length, 20);
  assert.equal(game.latestSave.grade, 4);
  assert.equal(game.latestSave.level, 'gentle');
  game.advance(3000);
  assert.equal(game.root.dataset.scene, 'playing');
  assert.match(game.html, /MISSION 01 <span>\/ 20/);
  assert.match(game.html, /풀이 시간/);
  assert.match(game.html, /여행 1/);
  assert.doesNotMatch(game.html, /120\.0초|남은 시간/);
  assert.equal(game.clock, '0.0초');
  game.advance(121000);
  assert.equal(game.root.dataset.scene, 'playing');
  assertNoRankings(game);
  assert.equal(game.clock, '121.0초');
  assert.equal(game.journeyScores.length, 0);
  game.click('data-answer', game.mathQuestions[0].correct);
  assert.equal(game.latestSave.totalAnswered, 1);
  assert.equal(game.latestSave.recent[0].seconds, 121, 'the countdown is excluded but there is no math timeout');
});

test('each math answer is saved exactly once and completion leads to a fresh twenty-question journey', () => {
  const game = createGame();
  game.begin('math');
  const questions = game.mathQuestions;
  const initialSaves = game.saves.length;
  const staleFirst = game.getButton('data-answer', questions[0].correct);
  questions.forEach((question, index) => {
    assertNoRankings(game);
    assert.ok(!game.html.includes(question.explanation), 'the answer explanation stays outside the question scene');
    game.advance(1000);
    const answer = index === 19 ? question.answers.find(value => value !== question.correct) : question.correct;
    game.click('data-answer', answer);
    assert.equal(game.latestSave.totalAnswered, index + 1);
    assert.equal(game.latestSave.totalCorrect, Math.min(index + 1, 19));
    assert.equal(game.saves.length, initialSaves + index + 1, 'one save follows each accepted answer');
    assert.equal(game.latestSave.recent.at(-1).q, question.q);
    assert.equal(game.latestSave.recent.at(-1).correctAnswer, question.correct);
    if (index === 0) {
      game.click('data-answer', questions[1].correct);
      assert.equal(game.latestSave.totalAnswered, 1, 'rapid input cannot advance a second question');
    }
    if (index === 1) {
      game.click(staleFirst);
      assert.equal(game.latestSave.totalAnswered, 2, 'a stale question cannot be saved again');
    }
  });
  assert.equal(game.root.dataset.scene, 'result');
  assertNoRankings(game);
  assert.equal(game.latestJourneyScore.correct, 19);
  assert.equal(game.latestJourneyScore.score, 950);
  assert.equal(game.latestJourneyScore.totalSeconds, 20);
  assert.equal(game.latestSave.completedLegs, 1);
  assert.equal(game.latestSave.active, null);
  assert.match(game.html, /20문제 · 1번의 여행 완주/);
  const completedState = game.storedState;
  game.advance(130000);
  assert.equal(game.latestSave.completedLegs, 1, 'timer ticks cannot complete a journey twice');
  game.click('data-next-leg');
  assert.equal(game.root.dataset.scene, 'countdown');
  assertNoRankings(game);
  const next = game.mathQuestions;
  assert.equal(next.length, 20);
  assert.equal(game.latestSave.bank.length, 40);
  assert.equal(game.latestSave.totalAnswered, 20);
  assert.equal(game.latestSave.active.sequence, 1);
  assert.equal(completedState.nextSequence, 1);
  assert.notEqual(next[0].id, questions[0].id);
  assert.ok(next.every(question => !questions.some(previous => previous.q === question.q)), 'the next leg excludes recently stored questions');
  game.advance(3000);
  next.forEach(question => { game.advance(1000); game.click('data-answer', question.correct); });
  assert.equal(game.latestSave.totalAnswered, 40);
  assert.equal(game.latestSave.totalCorrect, 39);
  assert.equal(game.latestSave.completedLegs, 2);
  game.click('data-see-ranks');
  assert.equal(game.root.dataset.scene, 'lobby');
  assert.equal((game.html.match(/class="sh-board(?:\s[^"]*)?"/g) ?? []).length, 6);
  assert.match(game.html, /여행 점수와 별도/);
});

test('leaving and reopening a math journey restores its next question and excludes paused time', () => {
  const first = createGame();
  first.begin('math');
  const questions = first.mathQuestions;
  questions.slice(0, 2).forEach(question => { first.advance(1000); first.click('data-answer', question.correct); });
  first.advance(3000);
  first.click('data-cancel');
  assert.equal(first.root.dataset.scene, 'lobby');
  assert.equal(first.latestSave.active.answers.length, 2);
  assert.equal(first.latestSave.active.elapsedMs, 5000);
  assert.equal(first.latestSave.active.questionElapsedMs, 3000);
  assert.equal(first.getButton('data-grade', '4').disabled, true);
  const snapshot = first.storedState;
  const saveCount = first.saves.length;
  first.advance(130000);
  assert.equal(first.saves.length, saveCount, 'leaving cannot create ghost answer saves');
  const restored = createGame({storedState: snapshot});
  assert.match(restored.html, /2 \/ 20문제 완료/);
  restored.begin('math');
  assert.equal(restored.getButton('data-answer', questions[2].correct).dataset.questionId, questions[2].id);
  assert.equal(restored.clock, '5.0초');
  assertNoRankings(restored);
  restored.advance(1000);
  restored.click('data-answer', questions[2].correct);
  assert.equal(restored.latestSave.totalAnswered, 3);
  assert.equal(restored.latestSave.recent.length, 3);
  assert.equal(restored.latestSave.recent.at(-1).seconds, 4, 'unfinished question timing resumes without counting the break or countdown');
  assert.equal(restored.latestSave.active.elapsedMs, 6000);
});

test('pagehide snapshots an unfinished math question without adding a fictitious answer', () => {
  const first = createGame();
  first.begin('math');
  const question = first.mathQuestions[0];
  first.advance(2500);
  first.pagehide();
  assert.equal(first.latestSave.totalAnswered, 0);
  assert.equal(first.latestSave.active.answers.length, 0);
  assert.equal(first.latestSave.active.questionElapsedMs, 2500);
  const restored = createGame({storedState: first.storedState});
  restored.begin('math');
  restored.advance(1000);
  restored.click('data-answer', question.correct);
  assert.equal(restored.latestSave.totalAnswered, 1);
  assert.equal(restored.latestSave.recent[0].seconds, 3.5);
});

test('choosing a different math journey preserves solved history while changing grade and level', () => {
  const game = createGame();
  game.begin('math');
  game.advance(1000);
  game.click('data-answer', game.mathQuestions[0].correct);
  game.click('data-cancel');
  game.click('data-grade', '6');
  assert.equal(game.latestSave.grade, 4, 'active journeys keep their original grade');
  game.click('data-discard');
  assert.equal(game.latestSave.active, null);
  assert.equal(game.latestSave.totalAnswered, 1);
  game.click('data-grade', '6');
  game.click('data-level', 'standard');
  game.begin('math');
  assert.equal(game.latestSave.active.grade, 6);
  assert.equal(game.latestSave.active.level, 'standard');
  assert.equal(game.latestSave.active.sequence, 1);
  assert.equal(game.latestSave.bank.length, 40);
  assert.equal(game.latestSave.totalAnswered, 1);
  assert.equal(game.latestSave.recent.length, 1);
});

function savedProgress() {
  const game = createGame();
  game.begin('math');
  game.advance(1000);
  game.click('data-answer', game.mathQuestions[0].correct);
  game.click('data-cancel');
  return game.storedState;
}

test('a late storage load restores saved progress after fallback when the session is unchanged', () => {
  const saved = savedProgress();
  const game = createGame({storedState: saved, autoLoad: false});
  assert.equal(game.getButton('data-start').disabled, true);
  game.advance(2100);
  assert.equal(game.getButton('data-start').disabled, false);
  assert.match(game.html, /이번 창에서만 기록/);
  game.deliverSavedState();
  assert.match(game.html, /1 \/ 20문제 완료/);
  assert.equal(game.getButton('data-grade', '4').disabled, true);
  game.begin('math');
  assert.equal(game.getButton('data-answer', saved.active.questions[1].correct).dataset.questionId, saved.active.questions[1].id);
  assert.equal(game.latestSave.totalAnswered, 1);
});

test('a late storage load never overwrites saved progress after fallback play has already started', () => {
  const saved = savedProgress();
  const game = createGame({storedState: saved, autoLoad: false});
  game.advance(2100);
  game.begin('math');
  const first = game.mathQuestions[0];
  const displayed = game.getButton('data-answer', first.correct).dataset.questionId;
  assert.equal(game.saves.length, 0);
  game.deliverSavedState();
  assert.equal(game.root.dataset.scene, 'playing');
  assert.equal(game.getButton('data-answer', first.correct).dataset.questionId, displayed);
  game.advance(1000);
  game.click('data-answer', first.correct);
  game.click('data-cancel');
  game.pagehide();
  assert.equal(game.saves.length, 0, 'the fallback session must not replace an older parent-owned journal');
  assert.deepEqual(game.storedState, saved);
  assert.match(game.html, /이번 창에서만 기록/);
  game.deliverSavedState();
  assert.equal(game.saves.length, 0, 'repeated late loads cannot re-enable persistence for the changed session');
});

test('the journey bridge accepts initial records only from its parent frame', () => {
  const game = createGame({autoLoad: false});
  game.deliver({type: 'learning-king-journey-state', state: null, available: true}, {});
  assert.equal(game.getButton('data-start').disabled, true);
  assert.equal(game.saves.length, 0);
  game.deliverSavedState();
  assert.equal(game.getButton('data-start').disabled, false);
  game.begin('math');
  assert.equal(game.latestSave.active.questions.length, 20);
});
