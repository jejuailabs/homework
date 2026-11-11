import assert from 'node:assert/strict';
import test from 'node:test';
import {withBanners} from './links';

test('teacher page links leave the sentence and become banners, however the model spaces them', () => {
  const href = '/teacher/homework?classId=dOonPQ9FBzlO9J1NjBHi&assignmentId=jKEhsSKmuGQk9HAJ4UdB';
  assert.deepEqual(withBanners(`새로 만들까요?\n\n[생활문 쓰기](${href})`), {text: '새로 만들까요?\n\n생활문 쓰기', links: [{label: '생활문 쓰기', href}]});
  assert.deepEqual(withBanners(`새로 만들까요?\n\n[생활문 쓰기]( ${href} )`), {text: '새로 만들까요?\n\n생활문 쓰기', links: [{label: '생활문 쓰기', href}]});
  assert.deepEqual(withBanners(`숙제 화면에서 보세요: ${href}`), {text: '숙제 화면에서 보세요:', links: [{label: '', href}]});
  assert.deepEqual(withBanners(`여기(${href})에서 확인해요.`), {text: '여기에서 확인해요.', links: [{label: '', href}]});
  assert.deepEqual(withBanners(`[생활문 쓰기](${href}) 그리고 ${href}`).links, [{label: '생활문 쓰기', href}]);
});
test('outside links and plain sentences are left alone', () => {
  assert.deepEqual(withBanners('[밖](https://example.com/teacher/x) 그대로'), {text: '[밖](https://example.com/teacher/x) 그대로', links: []});
  assert.deepEqual(withBanners('숙제 3개가 있어요.'), {text: '숙제 3개가 있어요.', links: []});
});
