import assert from 'node:assert/strict';
import {canMarkVideoStorageTest, chosenVideoStorage, defaultVideoStorage, isR2Path, r2VideoPath} from './video-storage';

assert.equal(r2VideoPath('u1', 'j1'), 'r2-videos/u1/j1/video.mp4');
assert.equal(isR2Path(r2VideoPath('u1', 'j1')), true);
assert.equal(isR2Path('processed-videos/u1/j1/video.mp4'), false);
assert.equal(isR2Path(undefined), false);

assert.equal(canMarkVideoStorageTest('admin', 'video'), true);
assert.equal(canMarkVideoStorageTest('superadmin', 'video'), true);
assert.equal(canMarkVideoStorageTest('teacher', 'video'), false);
assert.equal(canMarkVideoStorageTest('admin', 'image'), false);

assert.equal(chosenVideoStorage({videoStorageTest: true}, 'r2'), 'r2');
assert.equal(chosenVideoStorage({videoStorageTest: true}, 'google'), 'google');
assert.equal(chosenVideoStorage({videoStorageTest: true}, 'other'), 'google');
assert.equal(chosenVideoStorage({}, 'r2'), 'google');
assert.equal(chosenVideoStorage({videoStorageTest: 'true'}, 'r2'), 'google');

assert.equal(chosenVideoStorage({}, 'google', 'r2'), 'r2', 'ordinary homework follows the platform default');
assert.equal(chosenVideoStorage({videoStorageTest: true}, 'google', 'r2'), 'google', 'a test homework keeps the student choice');
assert.equal(chosenVideoStorage({videoStorageTest: true}, 'other', 'r2'), 'r2');

assert.equal(defaultVideoStorage(undefined, true), 'google', 'no switch document means Google');
assert.equal(defaultVideoStorage('google', true), 'google');
assert.equal(defaultVideoStorage('r2', true), 'r2');
assert.equal(defaultVideoStorage('r2', false), 'google', 'R2 not configured falls back to Google instead of failing');
assert.equal(defaultVideoStorage('r2', true, 'true'), 'google', 'kill switch wins');
assert.equal(defaultVideoStorage('R2', true), 'google');
