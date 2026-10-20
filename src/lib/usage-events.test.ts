import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanUsageCounters} from './usage-events';

test('usage counters keep only known positive values and cap each flush',()=>{
  assert.deepEqual(cleanUsageCounters({videoPlay:2.4,imageView:-1,unknown:5,imageBytesIn:Number.POSITIVE_INFINITY,imageBytesOut:'9'}),{videoPlay:2});
  assert.deepEqual(cleanUsageCounters({imageView:99999,imageBytesIn:3*1024**3}),{imageView:1000,imageBytesIn:2*1024**3});
  assert.deepEqual(cleanUsageCounters(null),{});
  assert.deepEqual(cleanUsageCounters([1]),{});
});
