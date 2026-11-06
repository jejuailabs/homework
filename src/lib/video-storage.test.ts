import assert from 'node:assert/strict';
import {canMarkVideoStorageTest, chosenVideoStorage, isR2Path, r2VideoPath} from './video-storage';

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
