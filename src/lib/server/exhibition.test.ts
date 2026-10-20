import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approvalCountDelta, artworkReview, artworkStudentId, artReaction, canConsumeExhibitionUpload,
  canParticipateExhibition, canSubmitExhibition, canViewArtwork, canViewArtworkFeedback, canViewExhibition, exhibitionStatus, exhibitionTheme,
  exhibitionUploadPolicy, nextPassport, nextReactionCounts, ownsExhibition,
  exhibitionStorageLimit, reserveExhibitionBytes, settleExhibitionBytes, releaseExhibitionBytes, exhibitionCursor, encodeExhibitionCursor, EXHIBITION_DERIVATIVE_RESERVATION, completeExhibitionWrites,
} from './exhibition-policy';

const teacher = { uid: 'teacher-a', role: 'teacher' as const };
const student = { uid: 'child-a', role: 'student' as const, classId: 'class-a', studentId: 'a' };
const exhibition = { ownerUid: 'teacher-a', classId: 'class-a', status: 'open' as const };

test('exhibition administration requires owning teacher even for platform administrators', () => {
  assert.equal(ownsExhibition(teacher, exhibition), true);
  assert.equal(ownsExhibition({ uid: 'teacher-b', role: 'superadmin' }, exhibition), false);
  assert.equal(ownsExhibition({ ...student, uid: teacher.uid }, exhibition), false);
  assert.equal(canViewExhibition({ uid: 'teacher-b', role: 'teacher' }, exhibition), false);
});
test('students can view class rooms and participate while open, but never upload photos', () => {
  assert.equal(canViewExhibition(student, exhibition), true);
  assert.equal(canSubmitExhibition(student, exhibition), false);
  assert.equal(canParticipateExhibition(student, exhibition), true);
  assert.equal(canViewExhibition(student, { ...exhibition, status: 'closed' }), true);
  assert.equal(canSubmitExhibition(student, { ...exhibition, status: 'closed' }), false);
  assert.equal(canParticipateExhibition(student, { ...exhibition, status: 'closed' }), false);
  assert.equal(canViewExhibition(student, { ...exhibition, status: 'draft' }), false);
  assert.equal(canSubmitExhibition(student, { ...exhibition, status: 'draft' }), false);
  assert.equal(canParticipateExhibition(student, { ...exhibition, status: 'draft' }), false);
  assert.equal(canViewExhibition({ ...student, classId: 'another-class' }, exhibition), false);
  assert.equal(canSubmitExhibition(teacher, { ...exhibition, status: 'draft' }), true);
});
test('building privacy remains class-scoped even when grade, year and owner labels are shared', () => {
  const room = { ...exhibition, grade: '3', year: 2026 };
  const anotherClass = { ...student, classId: 'class-b', grade: '3', year: 2026 };
  assert.equal(canViewExhibition(anotherClass, room), false);
  assert.equal(canParticipateExhibition(anotherClass, room), false);
  assert.equal(canViewExhibition(student, { ...room, classId: 'other-school' }), false);
  assert.equal(canViewExhibition({ ...student, classId: undefined }, room), false);
  assert.equal(canSubmitExhibition({ ...teacher, uid: 'another-teacher' }, room), false);
});
test('unapproved or revision artwork is visible only to its child and owner', () => {
  for (const status of ['pending', 'revision'] as const) {
    assert.equal(canViewArtwork(student, exhibition, { studentId: 'a', status }), true);
    assert.equal(canViewArtwork(student, exhibition, { studentId: 'b', status }), false);
    assert.equal(canViewArtwork(teacher, exhibition, { studentId: 'b', status }), true);
  }
  assert.equal(canViewArtwork(student, exhibition, { studentId: 'b', status: 'approved' }), true);
  assert.equal(canViewArtwork({ ...student, classId: 'other' }, exhibition, { studentId: 'a', status: 'approved' }), false);
});
test('upload manifest cannot cross owner or exhibition, or be reused after finalize', () => {
  const manifest = { userUid: teacher.uid, exhibitionId: 'show-a', status: 'pending' };
  assert.equal(canConsumeExhibitionUpload(teacher, 'show-a', manifest), true);
  assert.equal(canConsumeExhibitionUpload({ ...teacher, uid: 'other-teacher' }, 'show-a', manifest), false);
  assert.equal(canConsumeExhibitionUpload(teacher, 'show-b', manifest), false);
  assert.equal(canConsumeExhibitionUpload(teacher, 'show-a', { ...manifest, status: 'submitted' }), false);
  assert.equal(canConsumeExhibitionUpload(teacher, 'show-a', undefined), false);
  assert.equal(canConsumeExhibitionUpload(student, 'show-a', { ...manifest, userUid: student.uid }), true);
});
test('photo policy rejects animated/executable declarations and unsafe sizes', () => {
  assert.equal(exhibitionUploadPolicy('image/webp', 100 * 1024 * 1024).size, 100 * 1024 * 1024);
  for (const type of ['image/svg+xml', 'image/gif', 'application/pdf', 'text/html', 'image/heic']) assert.throws(() => exhibitionUploadPolicy(type, 10));
  for (const size of [0, -1, Infinity, NaN, 1.5, '1', 100 * 1024 * 1024 + 1]) assert.throws(() => exhibitionUploadPolicy('image/jpeg', size));
});
test('approval count changes only on entering or leaving approved state', () => {
  assert.equal(approvalCountDelta('pending', 'approved'), 1);
  assert.equal(approvalCountDelta('approved', 'approved'), 0);
  assert.equal(approvalCountDelta('approved', 'revision'), -1);
  assert.equal(approvalCountDelta('revision', 'revision'), 0);
  assert.equal(approvalCountDelta('revision', 'approved'), 1);
});
test('passport rewards are idempotent across repeated approvals and separate works', () => {
  const first = nextPassport(undefined, 'artist');
  assert.deepEqual(first, { artist: true, thoughtfulComment: false, stamps: 1 });
  assert.deepEqual(nextPassport(first, 'artist'), first);
  const second = nextPassport(first, 'thoughtfulComment');
  assert.deepEqual(second, { artist: true, thoughtfulComment: true, stamps: 2 });
  assert.deepEqual(nextPassport(second, 'artist'), second);
  assert.deepEqual(nextPassport(second, 'thoughtfulComment'), second);
});
test('review and reaction inputs reject unsupported states rather than trusting clients', () => {
  assert.equal(artworkReview('approved'), 'approved');
  assert.equal(exhibitionStatus('closed'), 'closed');
  assert.equal(artReaction('colors'), 'colors');
  for (const theme of ['cozy', 'forest', 'sky', 'ocean']) assert.equal(exhibitionTheme(theme), theme);
  assert.throws(() => artworkReview('pending'));
  assert.throws(() => exhibitionStatus('public'));
  assert.throws(() => artReaction('100-points'));
  assert.throws(() => exhibitionTheme('javascript:alert(1)'));
});
test('teacher photos can remain unassigned and gain an artist later without fake student IDs', () => {
  for (const value of [undefined, null, '', '   ']) assert.equal(artworkStudentId(value), '');
  assert.equal(artworkStudentId('student-a'), 'student-a');
  assert.throws(() => artworkStudentId(0));
  assert.throws(() => artworkStudentId('other/class'));
  assert.equal(canViewArtwork(student, exhibition, { studentId: '', status: 'approved' }), true);
  assert.equal(canViewArtwork(student, exhibition, { studentId: '', status: 'revision' }), false);
  assert.equal(canViewArtworkFeedback(student, exhibition, ''), false);
});
test('private teacher feedback and encouragement totals remain restricted to the author and teacher', () => {
  assert.equal(canViewArtworkFeedback(teacher, exhibition, 'b'), true);
  assert.equal(canViewArtworkFeedback(student, exhibition, 'a'), true);
  assert.equal(canViewArtworkFeedback(student, exhibition, 'b'), false);
  assert.equal(canViewArtworkFeedback({ ...student, classId: 'another-class' }, exhibition, 'a'), false);
  assert.equal(canViewArtworkFeedback({ uid: 'other-teacher', role: 'superadmin' }, exhibition, 'a'), false);
});
test('encouragement counts replace prior choices and do not grow on retries', () => {
  const initial = nextReactionCounts(undefined, undefined, 'colors');
  assert.deepEqual(initial, { colors: 1, idea: 0, story: 0 });
  assert.deepEqual(nextReactionCounts(initial, 'colors', 'colors'), initial);
  const changed = nextReactionCounts(initial, 'colors', 'story');
  assert.deepEqual(changed, { colors: 0, idea: 0, story: 1 });
  const otherChild = nextReactionCounts(changed, undefined, 'story');
  assert.deepEqual(otherChild, { colors: 0, idea: 0, story: 2 });
  assert.deepEqual(nextReactionCounts(otherChild, 'story', 'idea'), { colors: 0, idea: 1, story: 1 });
});
test('storage quota is bounded, counts pending originals and leaves no unlimited setting', () => {
  // The teacher's 200GB plan is the real limit; the gallery ledger only keeps a ceiling.
  assert.equal(exhibitionStorageLimit(undefined), 1024 ** 4);
  assert.equal(exhibitionStorageLimit(String(100 * 1024 ** 2)), 100 * 1024 ** 2);
  assert.equal(exhibitionStorageLimit(String(1024 ** 4)), 1024 ** 4);
  for (const value of ['unlimited', 'Infinity', '-1', '0', 100 * 1024 ** 2 - 1, 1024 ** 4 + 1]) assert.throws(() => exhibitionStorageLimit(value));
  const usage = { usedBytes: 0, reservedBytes: 0, limitBytes: 100 * 1024 ** 2 };
  const reserved = reserveExhibitionBytes(usage, 70 * 1024 ** 2 + EXHIBITION_DERIVATIVE_RESERVATION);
  assert.throws(() => reserveExhibitionBytes(reserved, 20 * 1024 ** 2 + EXHIBITION_DERIVATIVE_RESERVATION));
});
test('finalize converts reservation to actual bytes and failed-decode cleanup only frees deleted bytes once', () => {
  const empty = { usedBytes: 100, reservedBytes: 0, limitBytes: 5 * 1024 ** 3 };
  const pending = reserveExhibitionBytes(empty, 1000 + EXHIBITION_DERIVATIVE_RESERVATION);
  const finished = settleExhibitionBytes(pending, pending.reservedBytes, 1250);
  assert.deepEqual(finished, { ...empty, usedBytes: 1350 });
  const failedDelete = releaseExhibitionBytes(pending, pending.reservedBytes, false, false);
  assert.deepEqual(failedDelete, pending);
  const cleaned = releaseExhibitionBytes(pending, pending.reservedBytes, false, true);
  assert.deepEqual(cleaned, empty);
  assert.deepEqual(releaseExhibitionBytes(cleaned, pending.reservedBytes, true, true), empty);
  assert.deepEqual(releaseExhibitionBytes({ usedBytes: 1000, reservedBytes: 500, limitBytes: 100 }, 500, false, true), { usedBytes: 1000, reservedBytes: 0, limitBytes: 100 });
  assert.throws(() => settleExhibitionBytes(empty, 100, 10));
});
test('cursor validates timestamp, identifier and owner/building scope', () => {
  const position = { createdAt: '2026-10-13T00:00:00.000Z', id: 'room-a' };
  const encoded = encodeExhibitionCursor('teacher-a:building-a', position);
  assert.deepEqual(exhibitionCursor(encoded, 'teacher-a:building-a'), position);
  assert.throws(() => exhibitionCursor(encoded, 'teacher-a:building-b'));
  assert.throws(() => exhibitionCursor(encoded, 'teacher-b:building-a'));
  assert.throws(() => exhibitionCursor('not-json', 'teacher-a:building-a'));
  assert.throws(() => exhibitionCursor(encodeExhibitionCursor('scope', { ...position, id: 'invalid/path' }), 'scope'));
  assert.throws(() => exhibitionCursor(encodeExhibitionCursor('scope', { ...position, createdAt: 'not-a-date' }), 'scope'));
});
test('failed derivative write waits for the other in-flight save before cleanup can run', async () => {
  let lateWriteCompleted = false;
  const failure = new Error('simulated derivative write failure');
  await assert.rejects(completeExhibitionWrites([
    Promise.reject(failure),
    new Promise(resolve => setTimeout(() => { lateWriteCompleted = true; resolve(undefined); }, 15)),
  ]), error => error === failure);
  assert.equal(lateWriteCompleted, true);
});

// Upload reservations are still gated by the exhibition setting before they can be consumed.
test('students submit only into an opted-in open exhibition in their own class', () => {
  const enabled = {...exhibition, allowStudentUploads: true};
  assert.equal(canSubmitExhibition(student, enabled), true);
  assert.equal(canSubmitExhibition(student, {...enabled, status: 'closed'}), false);
  assert.equal(canSubmitExhibition(student, {...enabled, status: 'draft'}), false);
  assert.equal(canSubmitExhibition({...student, classId: 'other'}, enabled), false);
  assert.equal(canSubmitExhibition(student, {...enabled, allowStudentUploads: false}), false);
});
