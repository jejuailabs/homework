import assert from 'node:assert/strict';
import test from 'node:test';
import {takenDateFromBytes} from './photo-taken-date';

/** A minimal JPEG: SOI, APP1 Exif with IFD0 (DateTime + Exif pointer) and an Exif IFD (DateTimeOriginal), then SOS. */
function jpeg(little: boolean, original: string | null, modified: string | null) {
  const tiff: number[] = [], u16 = (v: number) => little ? [v & 255, v >> 8] : [v >> 8, v & 255], u32 = (v: number) => little ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255];
  const text = (s: string) => [...s].map(c => c.charCodeAt(0)).concat(0);
  // Layout: header(8) | IFD0 at 8 with 2 entries (2+24+4=30) → 38 | Exif IFD at 38 with 1 entry (2+12+4=18) → 56 | strings
  const modifiedAt = 56, originalAt = 76;
  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  tiff.push(...u16(2), ...u16(0x0132), ...u16(2), ...u32(20), ...u32(modifiedAt), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(38), ...u32(0));
  tiff.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(originalAt), ...u32(0));
  const pad = (s: string | null) => s ? text(s) : new Array(20).fill(0);
  tiff.push(...pad(modified), ...pad(original));
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff], size = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, size >> 8, size & 255, ...app1, 0xff, 0xda, 0, 2]).buffer;
}

test('reads the day a photo was taken, in either byte order', () => {
  assert.equal(takenDateFromBytes(jpeg(true, '2026:09:14 10:21:03', '2026:10:01 08:00:00')), '2026-09-14');
  assert.equal(takenDateFromBytes(jpeg(false, '2025:03:02 13:00:00', null)), '2025-03-02');
});

test('falls back to DateTime, then gives up quietly', () => {
  assert.equal(takenDateFromBytes(jpeg(true, null, '2026:10:01 08:00:00')), '2026-10-01');
  assert.equal(takenDateFromBytes(jpeg(true, '0000:00:00 00:00:00', null)), null);
  assert.equal(takenDateFromBytes(jpeg(true, '2026:02:30 00:00:00', null)), null);
  assert.equal(takenDateFromBytes(jpeg(true, '2026:02:30 00:00:00', '2026:03:01 09:00:00')), '2026-03-01', 'an impossible original falls through to DateTime');
  assert.equal(takenDateFromBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), null);
  assert.equal(takenDateFromBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer), null);
  assert.equal(takenDateFromBytes(new ArrayBuffer(0)), null);
});
