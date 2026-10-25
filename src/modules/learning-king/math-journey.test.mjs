import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('./demo/math-journey.js', import.meta.url), 'utf8');
const sandbox = { Date };
vm.runInNewContext(source, sandbox, { filename: 'math-journey.js' });
const M = sandbox.MathJourney;
const plain = value => JSON.parse(JSON.stringify(value));

// Independent BigInt rational oracle. It does not use the production math helpers.
function fraction(n, d = 1n) {
  n = BigInt(n); d = BigInt(d);
  const gcd = (a, b) => b ? gcd(b, a % b) : a < 0n ? -a : a || 1n;
  const factor = gcd(n, d);
  return [n / factor, d / factor];
}
function parse(value) {
  if (value.includes('/')) return fraction(...value.split('/'));
  if (value.includes('.')) {
    const [whole, decimals] = value.split('.');
    return fraction(BigInt(whole + decimals), 10n ** BigInt(decimals.length));
  }
  return fraction(value);
}
function oracle(math) {
  const values = math.values.map(([n, d]) => fraction(n, d));
  const add = (a, b) => fraction(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
  const multiply = (a, b) => fraction(a[0] * b[0], a[1] * b[1]);
  const divide = (a, b) => fraction(a[0] * b[1], a[1] * b[0]);
  switch (math.operation) {
    case 'add': return values.reduce(add, [0n, 1n]);
    case 'subtract': return add(values[0], [-values[1][0], values[1][1]]);
    case 'multiply': return values.reduce(multiply, [1n, 1n]);
    case 'divide': return divide(values[0], values[1]);
    case 'average': return divide(values.reduce(add, [0n, 1n]), [BigInt(values.length), 1n]);
    case 'percent': return multiply(divide(values[0], values[1]), [100n, 1n]);
    case 'max': return values.reduce((a, b) => a[0] * b[1] > b[0] * a[1] ? a : b);
    default: throw new Error(`Unknown operation ${math.operation}`);
  }
}

test('math journeys produce correct, distinct, nonnegative answers across all grades and levels', () => {
  let checked = 0;
  for (let grade = 1; grade <= 6; grade += 1) {
    for (const level of ['gentle', 'standard']) {
      const skills = new Set();
      for (let sequence = 0; sequence < 180; sequence += 1) {
        const date = `2026-10-${String(sequence % 28 + 1).padStart(2, '0')}`;
        const journey = M.generate({ grade, level, sequence, date });
        assert.equal(journey.questions.length, 20);
        assert.equal(new Set(journey.questions.map(q => q.q)).size, 20);
        assert.equal(new Set(journey.questions.map(q => q.id)).size, 20);
        for (const question of journey.questions) {
          assert.ok(question.q && question.skill && question.explanation);
          assert.equal(question.answers.length, 3);
          assert.equal(new Set(question.answers).size, 3);
          assert.equal(question.answers.filter(a => a === question.correct).length, 1);
          assert.deepEqual(parse(question.correct), oracle(question.math), question.q);
          const printed = /^([\d./]+) ([+−×÷]) ([\d./]+) = \?$/.exec(question.q);
          if (printed) {
            assert.equal(question.math.operation, { '+': 'add', '−': 'subtract', '×': 'multiply', '÷': 'divide' }[printed[2]]);
            assert.deepEqual(parse(printed[1]), fraction(...question.math.values[0]));
            assert.deepEqual(parse(printed[3]), fraction(...question.math.values[1]));
          }
          const numbers = question.answers.map(answer => {
            assert.match(answer, /^\d+(?:\.\d+|\/\d+)?$/);
            const result = parse(answer);
            assert.ok(result[0] >= 0n && result[1] > 0n);
            return result.join('/');
          });
          assert.equal(new Set(numbers).size, 3, 'Different spellings must not hide equivalent answer choices');
          if (question.skill === '백분율') assert.ok(question.answers.every(answer => Number(answer) <= 100));
          if (question.skill === '시간 더하기') assert.ok(question.answers.every(answer => Number(answer) < 60));
          if (question.skill === '돈 계산') {
            const available = Number(question.q.match(/^\d+/)[0]);
            assert.ok(question.answers.every(answer => Number(answer) <= available));
          }
          skills.add(question.skill);
          checked += 1;
        }
      }
      assert.ok(skills.size >= 6, `${grade} ${level} needs a broad skill mix`);
    }
  }
  assert.equal(checked, 43200);
});

test('math journey seeds replay exactly and change with the day, grade, level or leg', () => {
  const base = { grade: 4, level: 'standard', date: '2026-10-25', sequence: 0 };
  const first = M.generate(base);
  assert.deepEqual(plain(M.generate(base)), plain(first));
  for (const change of [{ date: '2026-10-26' }, { grade: 5 }, { level: 'gentle' }, { sequence: 1 }]) {
    const next = M.generate({ ...base, ...change });
    assert.notEqual(next.id, first.id);
    assert.notDeepEqual(plain(next.questions.map(q => q.q)), plain(first.questions.map(q => q.q)));
  }
});

test('math journeys avoid recently seen prompts and stay usable when a type is exhausted', () => {
  for (let grade = 1; grade <= 6; grade += 1) {
    const config = { grade, level: 'gentle', date: '2026-10-25' };
    const first = M.generate({ ...config, sequence: 0 });
    const seen = first.questions.map(q => q.q);
    const next = M.generate({ ...config, sequence: 1, seen });
    assert.ok(next.questions.every(q => !seen.includes(q.q)));
  }
  // Includes every possible gentle grade-1 addition prompt; bounded fallback must progress.
  const seen = [];
  for (let a = 1; a <= 9; a += 1) for (let b = 1; b <= 10 - a; b += 1) seen.push(`${a} + ${b} = ?`);
  const exhausted = M.generate({ grade: 1, level: 'gentle', date: '2026-10-25', sequence: 7, seen, count: 60 });
  assert.equal(exhausted.questions.length, 60);
  assert.equal(new Set(exhausted.questions.map(q => q.q)).size, 60);
});

test('math journey date follows Korean midnight independently of the host timezone', () => {
  assert.equal(M.dateKey('2026-10-24T14:59:59.999Z'), '2026-10-24');
  assert.equal(M.dateKey('2026-10-24T15:00:00.000Z'), '2026-10-25');
  assert.equal(M.dateKey(new Date('2026-12-31T15:00:00.000Z')), '2027-01-01');
  assert.throws(() => M.dateKey('not-a-date'));
});

test('math journey scoring uses only accuracy and bounds missing or invalid records', () => {
  const fast = M.score(Array.from({ length: 20 }, () => ({ correct: true, seconds: 1 })));
  const thoughtful = M.score(Array.from({ length: 20 }, () => ({ correct: true, seconds: 95 })));
  assert.equal(fast.score, 1000);
  assert.equal(thoughtful.score, fast.score);
  assert.equal(thoughtful.speedPoints, 0);
  assert.equal(thoughtful.totalSeconds, 1900);
  assert.equal(thoughtful.averageSeconds, 95);
  const partial = M.score([{ correct: true, seconds: 10 }, { correct: false, seconds: 15 }]);
  assert.equal(partial.score, 50);
  assert.equal(partial.correct, 1);
  assert.equal(partial.accuracy, 5);
  assert.equal(M.score(Array(25).fill({ correct: true, seconds: 1 })).score, 1000);
  assert.equal(M.score([null, { correct: true, seconds: NaN }, { correct: false, seconds: -1 }]).totalSeconds, 0);
  assert.equal(M.score([{ correct: true, seconds: 1 }], 4).score, 250);
});

test('math journeys reject invalid settings and contain no external service calls', () => {
  for (const input of [{ grade: 0 }, { grade: 7 }, { grade: 1.5 }, { level: 'unknown' }, { date: '2026-02-30' }, { date: '<script>' }, { sequence: -1 }, { sequence: 0.5 }, { count: 0 }, { count: 61 }]) {
    assert.throws(() => M.generate(input));
  }
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|https?:\/\/|WebSocket|localStorage|setInterval\s*\(/);
});
