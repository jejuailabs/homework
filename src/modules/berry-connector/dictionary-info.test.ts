import assert from 'node:assert/strict';
import {dictionaryInfo} from './dictionary-info';

const ready = dictionaryInfo({configured: true, disabled: false});
assert.equal(ready.available, true);
assert.equal(ready.link, '/teacher/tools/dictionary');
assert.match(ready.search_order, /정확히 일치/);
assert.equal(ready.read_aloud.berry_can_start, false, 'metadata cannot authorize paid speech');
assert.deepEqual(ready.browser_only, ['단어장', '최근 검색어']);
assert.equal(dictionaryInfo({configured: false, disabled: false}).available, false, 'missing key is not a working connection');
assert.equal(dictionaryInfo({configured: true, disabled: true}).available, false, 'disabled tool cannot be advertised as available');
assert.ok(!('key' in ready) && !('entries' in ready), 'metadata contains neither credentials nor search results');
console.log('dictionary info tests ok');
