'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./demo/model.js', import.meta.url), 'utf8');
function fresh() {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  return context.SoloRank;
}
const model = fresh();
const five = (correct, seconds) => Array.from({ length: 5 }, (_, index) => ({ correct: index < correct, seconds }));

test('accuracy dominates speed across every adjacent correct-answer count', () => {
  for (let count = 0; count < 5; count += 1) {
    assert.ok(model.score(five(count + 1, 30)).score > model.score(five(count, 0)).score);
  }
  assert.equal(model.score(five(5, 3)).score, 1000);
  assert.equal(model.score(five(5, 20)).score, 850);
  assert.equal(model.score(five(0, 0)).score, 0);
  assert.equal(model.score(five(0, 0)).speedPoints, 0);
});

test('rounds once at the end, handles missing answers and invalid seconds without NaN', () => {
  assert.equal(model.score(five(5, 11)).score, Math.round(850 + 5 * 30 * 9 / 17));
  for (const input of [undefined, [], [{ correct: true, seconds: NaN }], [{ correct: false, seconds: Infinity }], [{ correct: true, seconds: -1 }]]) {
    const record = model.score(input);
    assert.equal(record.answers.length, 5);
    for (const key of ['correct', 'totalSeconds', 'averageSeconds', 'accuracy', 'accuracyPoints', 'speedPoints', 'score']) {
      assert.equal(Number.isFinite(record[key]), true, key);
    }
    assert.ok(record.score >= 0 && record.score <= 1000);
  }
  const invalid = model.score([{ correct: true, seconds: NaN }]);
  assert.equal(invalid.speedPoints, 0);
  assert.equal(invalid.accuracy, 20);
});

test('deterministic fictional roster has complete equal-sized affiliations', () => {
  assert.equal(model.roster.length, 288);
  assert.equal(new Set(model.roster.map(person => person.id)).size, 288);
  assert.equal(model.roster.filter(person => person.id === model.myId).length, 1);
  assert.equal(JSON.stringify(model.roster), JSON.stringify(fresh().roster));
  for (const affiliation of model.affiliations) {
    assert.equal(model.roster.filter(person => person.region === affiliation.region).length, 72);
    for (const school of affiliation.schools) {
      assert.equal(model.roster.filter(person => person.region === affiliation.region && person.school === school).length, 24);
    }
  }
});

test('all six boards agree with the same roster and averages', () => {
  for (const subject of ['math', 'english']) {
    const boards = model.boards(subject);
    assert.equal(boards.length, 6);
    assert.equal(JSON.stringify(boards.map(board => board.count)), JSON.stringify([8, 24, 72, 3, 3, 4]));
    for (const board of boards) {
      assert.equal(board.rows.length, board.count);
      assert.ok(board.myRow && board.myRank >= 1);
      assert.equal(board.rows[0].rank, 1);
      assert.equal(board.myRow.rank, board.myRank);
      for (const row of board.rows) {
        assert.equal(row.participants, row.rosterCount);
        assert.ok(row.rank >= 1);
        for (const key of ['score', 'accuracy', 'averageSeconds']) assert.equal(Number.isFinite(row[key]), true);
        if (board.kind === 'individual') {
          assert.equal(row.score, model.roster.find(person => person.id === row.id)[subject].score);
        } else {
          const members = model.roster.filter(person => person.region === row.region && (!row.school || person.school === row.school) && (!row.classId || person.classId === row.classId));
          assert.equal(row.count, members.length);
          const mean = members.reduce((sum, person) => sum + person[subject].score, 0) / members.length;
          assert.equal(row.score, Math.round(mean * 10) / 10);
        }
      }
      for (let index = 1; index < board.rows.length; index += 1) {
        assert.ok(board.rows[index - 1].score >= board.rows[index].score);
      }
    }
  }
});

test('individual rank objects remain independent across nested ranking scopes', () => {
  const [classBoard, schoolBoard, localBoard] = model.boards('math');
  assert.notEqual(classBoard.myRow, schoolBoard.myRow);
  assert.notEqual(schoolBoard.myRow, localBoard.myRow);
  assert.equal(classBoard.myRow.rank, 1);
  assert.equal(schoolBoard.myRow.rank, 2);
  assert.equal(localBoard.myRow.rank, 14);
  for (const board of [classBoard, schoolBoard, localBoard]) {
    board.rows.forEach((row, index) => {
      const previous = board.rows[index - 1];
      const tie = previous && row.score === previous.score && row.accuracy === previous.accuracy && row.averageSeconds === previous.averageSeconds;
      assert.equal(row.rank, tie ? previous.rank : index + 1);
    });
  }
});

test('an override updates all related group averages without mutating the baseline', () => {
  const before = JSON.stringify(model.roster);
  const baseline = model.boards('math');
  const overridden = model.boards('math', model.score(five(0, 12)));
  for (let index = 0; index < 3; index += 1) assert.equal(overridden[index].myRow.score, 0);
  for (let index = 3; index < 6; index += 1) {
    assert.ok(overridden[index].myRow.score < baseline[index].myRow.score);
    for (const row of overridden[index].rows.filter(row => !row.ours)) {
      assert.equal(row.score, baseline[index].rows.find(previous => previous.id === row.id).score);
    }
  }
  assert.equal(JSON.stringify(model.roster), before);
  assert.equal(JSON.stringify(model.boards('english')), JSON.stringify(fresh().boards('english')));
});

test('exact ties share competition rank and each original question has one answer', () => {
  const isolated = fresh();
  isolated.roster.forEach(person => { person.math = isolated.score(five(5, 10)); });
  isolated.boards('math').forEach(board => {
    assert.equal(board.rows.every(row => row.rank === 1), true);
  });
  for (const subject of ['english']) {
    assert.equal(model.questions[subject].length, 5);
    for (const question of model.questions[subject]) {
      assert.equal(question.answers.filter(answer => answer === question.correct).length, 1);
      assert.ok(question.explanation.length > 0);
    }
  }
});
