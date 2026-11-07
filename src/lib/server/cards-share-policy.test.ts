import assert from 'node:assert/strict';
import { CARD_REWARDS, SHARE_DEFAULT_DAYS, SHARE_MAX_DAYS, cardRewardKinds, cardRewardLedgerId, isShareToken, newShareToken, practiceWords, requiredStudyPercent, shareDays, shareExpiry, shareName, shareNameMode, shareNote, shareState, shareTokenHash } from './cards-share-policy';

// Tokens: 256 random bits as 43 base64url characters, never the same twice, stored only as a hash.
const tokens = Array.from({ length: 200 }, newShareToken);
assert.ok(tokens.every(isShareToken), 'every new token has the public shape');
assert.equal(new Set(tokens).size, tokens.length, 'tokens do not repeat');
assert.equal(Buffer.from(tokens[0], 'base64url').length, 32, 'a token carries 32 random bytes');
assert.ok(!isShareToken('short') && !isShareToken(`${tokens[0]}x`) && !isShareToken(tokens[0].slice(0, 42) + '/') && !isShareToken(undefined), 'other shapes are refused before any lookup');
assert.match(shareTokenHash(tokens[0]), /^[0-9a-f]{64}$/);
assert.equal(shareTokenHash(tokens[0]), shareTokenHash(tokens[0]), 'the hash is stable for lookups');
assert.notEqual(shareTokenHash(tokens[0]), shareTokenHash(tokens[1]));
assert.ok(!shareTokenHash(tokens[0]).includes(tokens[0]), 'the hash does not contain the token');

// Expiry: 14 days unless told, 1-60 whole days.
assert.equal(shareDays(undefined), SHARE_DEFAULT_DAYS);
assert.equal(shareDays(60), SHARE_MAX_DAYS);
for (const bad of [0, 61, 1.5, '14', -1, Number.NaN]) assert.throws(() => shareDays(bad), /1~60일/, `days ${String(bad)} is refused`);
const at = Date.parse('2026-11-07T00:00:00.000Z');
assert.equal(shareExpiry(14, at), '2026-11-21T00:00:00.000Z');
assert.equal(shareState({ expiresAt: shareExpiry(1, at) }, at), 'active');
assert.equal(shareState({ expiresAt: shareExpiry(1, at) }, at + 86_400_000), 'expired', 'the link ends exactly at its expiry');
assert.equal(shareState({ expiresAt: shareExpiry(1, at) }, at + 86_399_999), 'active');
assert.equal(shareState({ expiresAt: shareExpiry(14, at), revokedAt: '2026-11-08T00:00:00.000Z' }, at), 'revoked', 'revocation wins over time left');
assert.equal(shareState({}, at), 'expired', 'a broken record never reads as active');
assert.equal(shareState({ expiresAt: 'later' }, at), 'expired');

// Names: first name by default; full or none when the teacher chooses.
assert.equal(shareNameMode(undefined), 'given');
assert.throws(() => shareNameMode('nickname'), /이름 표시/);
assert.equal(shareName('김민준', 'given'), '민준');
assert.equal(shareName('이준', 'given'), '준');
assert.equal(shareName('Mia Park', 'given'), 'Mia');
assert.equal(shareName('김민준', 'full'), '김민준');
assert.equal(shareName('김민준', 'none'), '');
assert.equal(shareName('  ', 'given'), '');
assert.equal(shareNote(undefined), '');
assert.equal(shareNote('  잘했어요\n집에서도 연습해요\u0007 '), '잘했어요\n집에서도 연습해요');
assert.throws(() => shareNote('가'.repeat(301)), /300자/);
assert.throws(() => shareNote(3), /한마디/);

// Progress shown to a parent.
const modes = (memorize: number, recall: number, spell: number) => ({ memorize: { requiredCount: memorize, direction: 'front-back' as const, rangeStart: 1, rangeEnd: 4 }, recall: { requiredCount: recall, direction: 'front-back' as const, rangeStart: 1, rangeEnd: 4 }, spell: { requiredCount: spell, direction: 'front-back' as const, rangeStart: 1, rangeEnd: 4 } });
assert.equal(requiredStudyPercent({ memorize: 4, recall: 2, spell: 9 }, modes(4, 4, 0)), 75, 'extra spell does not fill recall');
assert.equal(requiredStudyPercent({ memorize: 0, recall: 0, spell: 0 }, modes(0, 0, 0)), null, 'nothing required reads as null');
assert.equal(requiredStudyPercent({ memorize: 1, recall: 0, spell: 0 }, modes(3, 0, 0)), 33);
const cards = ['a', 'b', 'c', 'd'].map(id => ({ id, front: id.toUpperCase(), back: `뜻 ${id}`, example: '', alternatives: [] }));
assert.deepEqual(practiceWords({ c: 3, a: 1, b: 3, gone: 9 }, cards, 2), [{ front: 'B', back: '뜻 b', count: 3 }, { front: 'C', back: '뜻 c', count: 3 }], 'most missed first, set order on ties, removed cards dropped');
assert.deepEqual(practiceWords(undefined, cards), []);

// Rewards: only the moment a flag turns on, never for a set with nothing required or a goal of 0.
const off = { studyComplete: false, goalReached: false }, done = { studyComplete: true, goalReached: false }, both = { studyComplete: true, goalReached: true };
assert.deepEqual(cardRewardKinds(off, done, modes(4, 0, 0), 80), ['study']);
assert.deepEqual(cardRewardKinds(done, done, modes(4, 0, 0), 80), [], 'more study after finishing pays nothing more');
assert.deepEqual(cardRewardKinds(done, both, modes(4, 0, 0), 80), ['goal']);
assert.deepEqual(cardRewardKinds(off, both, modes(4, 0, 0), 80), ['study', 'goal']);
assert.deepEqual(cardRewardKinds(both, both, modes(4, 0, 0), 80), [], 'a second passing score pays nothing');
assert.deepEqual(cardRewardKinds(off, done, modes(0, 0, 0), 80), [], 'nothing required: no study reward');
assert.deepEqual(cardRewardKinds(done, both, modes(4, 0, 0), 0), [], 'a goal of 0 pays nothing');
assert.equal(cardRewardLedgerId('study', 'dist1'), 'cards_study_dist1', 'one fixed receipt per distribution and kind');
assert.notEqual(cardRewardLedgerId('study', 'dist1'), cardRewardLedgerId('goal', 'dist1'));
assert.ok(CARD_REWARDS.study > 0 && CARD_REWARDS.goal > 0 && CARD_REWARDS.study + CARD_REWARDS.goal <= 15, 'small, fixed amounts');
console.log('cards share and reward policy tests ok');
