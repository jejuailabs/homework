import assert from 'node:assert/strict';
import {matchesShared, parseShareMembers, readSharing, sharedAccess} from './cards-sharing';

assert.deepEqual(readSharing(undefined), {visibility: 'private', allowCopy: false}, 'a set is private until its owner says otherwise');
assert.deepEqual(readSharing({visibility: 'private', allowCopy: true}), {visibility: 'private', allowCopy: false}, 'copy needs the set to be shared');
assert.deepEqual(readSharing({visibility: 'shared', allowCopy: true}), {visibility: 'shared', allowCopy: true});

assert.deepEqual(parseShareMembers(' Kim@School.kr\nlee@school.kr, kim@school.kr ;me@mine.kr ', 'ME@mine.kr'), {members: ['kim@school.kr', 'lee@school.kr']}, 'trimmed, lower-cased, deduplicated, without the owner');
assert.ok('error' in parseShareMembers('not-an-email', null));
assert.ok('error' in parseShareMembers(Array.from({length: 31}, (_, index) => `t${index}@school.kr`), null), 'thirty colleagues at most');
assert.deepEqual(parseShareMembers([], null), {members: []}, 'an empty list turns sharing off');

const folder = {ownerUid: 'owner', shareMembers: ['kim@school.kr']};
const set = {ownerUid: 'owner', folderId: 'f1', sharing: {visibility: 'shared', allowCopy: false}};
assert.deepEqual(sharedAccess(set, folder, {uid: 'kim', email: 'Kim@School.kr'}), {visible: true, copy: false});
assert.deepEqual(sharedAccess({...set, sharing: {visibility: 'shared', allowCopy: true}}, folder, {uid: 'kim', email: 'kim@school.kr'}), {visible: true, copy: true});
assert.equal(sharedAccess({...set, sharing: undefined}, folder, {uid: 'kim', email: 'kim@school.kr'}).visible, false, 'a private set in a shared folder stays hidden');
assert.equal(sharedAccess(set, folder, {uid: 'lee', email: 'lee@school.kr'}).visible, false, 'only the listed colleagues');
assert.equal(sharedAccess({...set, archived: true}, folder, {uid: 'kim', email: 'kim@school.kr'}).visible, false, 'archived sets are not shown');
assert.equal(sharedAccess(set, {...folder, ownerUid: 'someone'}, {uid: 'kim', email: 'kim@school.kr'}).visible, false, 'the folder must belong to the set owner');
assert.equal(sharedAccess(set, folder, {uid: 'kim', email: null}).visible, false, 'no verified email, no access');

assert.equal(matchesShared({title: 'Lesson 3 단어', description: '중1 교과서', ownerName: '김선생'}, '중1 단어'), true);
assert.equal(matchesShared({title: 'Lesson 3 단어'}, 'lesson 4'), false);
console.log('cards sharing tests ok');
