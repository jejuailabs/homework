import assert from 'node:assert/strict';
import test from 'node:test';
import { assertBoardOwner, assertBoardWrite, boardPostInput, boardSettings, boardUploadPolicy, canViewBoard, canViewBoardComment, canViewBoardPost, canWriteBoard, changedReaction, safeBoardLink } from './participation-policy';

const teacher = { uid: 'teacher-a', role: 'teacher' };
const otherTeacher = { uid: 'teacher-b', role: 'teacher' };
const student = { uid: 'student-a', role: 'student', classId: 'class-a', studentId: 'one' };
const peer = { uid: 'student-b', role: 'student', classId: 'class-a', studentId: 'two' };
const outsider = { uid: 'student-c', role: 'student', classId: 'class-b', studentId: 'three' };
const board = { ownerUid: teacher.uid, classId: 'class-a', status: 'open', sections: [{ id: 'group-one', title: '1모둠' }] };
const post = { authorUid: student.uid, status: 'published' };

test('board reads are confined to owner and authenticated class, even for other admins', () => {
  assert.equal(canViewBoard(teacher, board), true);
  assert.equal(canViewBoard(student, board), true);
  for (const actor of [outsider, otherTeacher, { uid: 'admin', role: 'superadmin' }]) assert.equal(canViewBoard(actor, board), false);
});
test('frozen allows reading but blocks every student write through shared policy', () => {
  const frozen = { ...board, status: 'frozen' };
  assert.equal(canViewBoard(student, frozen), true);
  assert.equal(canWriteBoard(student, frozen), false);
  assert.throws(() => assertBoardWrite(student, frozen));
  assert.doesNotThrow(() => assertBoardWrite(teacher, frozen));
});
test('archived board is invisible to students but manageable by owner', () => {
  const archived = { ...board, status: 'archived' };
  assert.equal(canViewBoard(student, archived), false);
  assert.equal(canViewBoardPost(student, archived, post), false);
  assert.equal(canViewBoard(teacher, archived), true);
});
test('pending and hidden submissions are visible only to their author and teacher', () => {
  for (const status of ['pending', 'hidden']) {
    const item = { ...post, status };
    assert.equal(canViewBoardPost(peer, board, item), false);
    assert.equal(canViewBoardPost(student, board, item), true);
    assert.equal(canViewBoardPost(teacher, board, item), true);
    assert.equal(canViewBoardPost(outsider, board, item), false);
  }
});
test('think-first mode protects published posts until teacher reveals', () => {
  const hidden = { ...board, revealMode: true, revealed: false };
  assert.equal(canViewBoardPost(peer, hidden, post), false);
  assert.equal(canViewBoardPost(student, hidden, post), true);
  assert.equal(canViewBoardPost(teacher, hidden, post), true);
  assert.equal(canViewBoardPost(peer, { ...hidden, revealed: true }, post), true);
});
test('a comment cannot bypass its parent post reveal/moderation barrier', () => {
  const comment = { authorUid: peer.uid, status: 'published' };
  assert.equal(canViewBoardComment(peer, { ...board, revealMode: true, revealed: false }, post, comment), false);
  assert.equal(canViewBoardComment(peer, board, { ...post, status: 'pending' }, comment), false);
  assert.equal(canViewBoardComment(student, board, post, { ...comment, status: 'pending' }), false);
  assert.equal(canViewBoardComment(teacher, board, post, { ...comment, status: 'pending' }), true);
});
test('deleted posts/comments are never returned, including to owner', () => {
  assert.equal(canViewBoardPost(teacher, board, { ...post, deleted: true }), false);
  assert.equal(canViewBoardComment(teacher, board, post, { ...post, deleted: true }), false);
});
test('settings whitelist ignores arbitrary ownership and rejects invalid booleans/layouts', () => {
  assert.deepEqual(boardSettings({ ownerUid: 'intruder', classId: 'class-b', title: ' 함께 생각해요 ' }), { title: '함께 생각해요' });
  assert.throws(() => boardSettings({ anonymous: 'false' }));
  assert.deepEqual(boardSettings({ publicViewEnabled: true, visitorComments: false }), { publicViewEnabled: true, visitorComments: false });
  assert.throws(() => boardSettings({ visitorComments: 'yes' }));
  assert.throws(() => boardSettings({ layout: 'javascript' }));
  assert.throws(() => assertBoardOwner(student, board));
});
test('section IDs are unique, bounded and only existing board sections may be assigned', () => {
  assert.throws(() => boardSettings({ sections: [{ id: 'a', title: 'A' }, { id: 'a', title: 'B' }] }));
  assert.throws(() => boardPostInput({ sectionId: 'another-board-section' }, board));
  assert.deepEqual(boardPostInput({ sectionId: 'group-one' }, board), { sectionId: 'group-one' });
});
test('links cannot use executable schemes, credentials or control URL parsing', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'file:///x', 'https://user:password@example.com']) assert.throws(() => safeBoardLink(value));
  assert.equal(safeBoardLink('https://example.com/activity'), 'https://example.com/activity');
});
test('polls require 2-10 uniquely identified nonempty options', () => {
  assert.throws(() => boardPostInput({ poll: { question: '질문', options: [{ id: 'a', text: 'A' }] } }, board));
  assert.throws(() => boardPostInput({ poll: { question: '질문', options: [{ id: 'a', text: 'A' }, { id: 'a', text: 'B' }] } }, board));
  assert.equal(boardPostInput({ poll: { question: '질문', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] } }, board).poll?.options.length, 2);
});
test('post positions, locations and attachment references reject malicious or unbounded data', () => {
  assert.throws(() => boardPostInput({ x: NaN }, board));
  assert.throws(() => boardPostInput({ location: { lat: 91, lng: 0, label: '' } }, board));
  assert.throws(() => boardPostInput({ uploadIds: ['../private'] }, board));
  assert.throws(() => boardPostInput({ uploadIds: ['same', 'same'] }, board));
  assert.throws(() => boardPostInput({ uploadIds: Array.from({ length: 11 }, (_, i) => `id${i}`) }, board));
});
test('reaction retries and replacements never inflate counts', () => {
  const once = changedReaction({}, undefined, 'heart');
  assert.equal(once.heart, 1);
  assert.deepEqual(changedReaction(once, 'heart', 'heart'), once);
  assert.deepEqual(changedReaction(once, 'heart', 'idea'), { heart: 0, star: 0, clap: 0, idea: 1 });
  assert.deepEqual(changedReaction(once, 'heart', null), { heart: 0, star: 0, clap: 0, idea: 0 });
  assert.throws(() => changedReaction({}, undefined, '__proto__'));
});
test('upload policy excludes active content and strictly caps bytes', () => {
  for (const type of ['text/html', 'image/svg+xml', 'application/javascript', 'application/octet-stream']) assert.throws(() => boardUploadPolicy(type, 100));
  for (const size of [0, -1, 0.5, NaN, Infinity, 100 * 1024 ** 2 + 1]) assert.throws(() => boardUploadPolicy('image/png', size));
  assert.equal(boardUploadPolicy('video/mp4', 250 * 1024 ** 2).kind, 'video');
  assert.throws(() => boardUploadPolicy('video/mp4', 250 * 1024 ** 2 + 1));
  assert.equal(boardUploadPolicy('audio/webm', 1024).kind, 'audio');
});
