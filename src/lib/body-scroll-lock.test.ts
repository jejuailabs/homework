import assert from 'node:assert/strict';
import test from 'node:test';
import {lockBodyScroll, lockBodyScrollWhen} from './body-scroll-lock';

class FakeStyle {
  private properties = new Map<string, {value: string; priority: string}>();
  getPropertyValue(name: string) {return this.properties.get(name)?.value || '';}
  getPropertyPriority(name: string) {return this.properties.get(name)?.priority || '';}
  setProperty(name: string, value: string, priority = '') {this.properties.set(name, {value, priority});}
  removeProperty(name: string) {const value = this.getPropertyValue(name); this.properties.delete(name); return value;}
}
class FakeMedia extends EventTarget {
  constructor(public matches: boolean) {super();}
  change(matches: boolean) {this.matches = matches; this.dispatchEvent(new Event('change'));}
}
const body = () => ({style: new FakeStyle()} as unknown as HTMLElement);
const query = (media: FakeMedia) => media as unknown as MediaQueryList;
const overflow = (element: HTMLElement) => element.style.getPropertyValue('overflow');

test('desktop exhibition deep link does not capture the child dialog lock when its media query is false', () => {
  const element = body(), media = new FakeMedia(false);
  const closeGallery = lockBodyScroll(element);
  const leaveExhibition = lockBodyScrollWhen(query(media), element);
  assert.equal(overflow(element), 'hidden');
  closeGallery();
  assert.equal(overflow(element), '', 'closing the gallery must allow the desktop page to scroll');
  leaveExhibition();
  assert.equal(overflow(element), '', 'navigating to daily quiz must not restore a stale hidden value');
});

test('mobile gallery and page locks restore scrolling in either route cleanup order', () => {
  for (const parentFirst of [true, false]) {
    const element = body(), media = new FakeMedia(true);
    const leavePage = lockBodyScrollWhen(query(media), element);
    const closeGallery = lockBodyScroll(element);
    const [first, last] = parentFirst ? [leavePage, closeGallery] : [closeGallery, leavePage];
    first();
    assert.equal(overflow(element), 'hidden', 'remaining owner still needs the background locked');
    last();
    assert.equal(overflow(element), '', 'the last owner restores the original scroll state');
  }
});

test('duplicate cleanup cannot unlock another modal or overwrite a later lock', () => {
  const element = body(), closeFirst = lockBodyScroll(element), closeSecond = lockBodyScroll(element);
  closeFirst(); closeFirst();
  assert.equal(overflow(element), 'hidden');
  closeSecond();
  assert.equal(overflow(element), '');
  const closeLater = lockBodyScroll(element);
  closeFirst(); closeSecond();
  assert.equal(overflow(element), 'hidden');
  closeLater();
  assert.equal(overflow(element), '');
});

test('resizing an exhibition keeps an open modal locked without accumulating media locks', () => {
  const element = body(), media = new FakeMedia(true);
  const leavePage = lockBodyScrollWhen(query(media), element), closeModal = lockBodyScroll(element);
  media.change(false);
  assert.equal(overflow(element), 'hidden', 'the modal remains open on desktop');
  media.change(true); media.change(true);
  closeModal();
  assert.equal(overflow(element), 'hidden', 'the mobile page still owns its lock');
  media.change(false);
  assert.equal(overflow(element), '', 'repeated matching events must not leak extra owners');
  leavePage();
  media.change(true);
  assert.equal(overflow(element), '', 'a removed page must stop responding to resize events');
});

test('the original overflow value and important priority survive overlapping owners', () => {
  const element = body();
  element.style.setProperty('overflow', 'scroll', 'important');
  const closeOne = lockBodyScroll(element), closeTwo = lockBodyScroll(element);
  assert.equal(overflow(element), 'hidden');
  closeOne();
  assert.equal(overflow(element), 'hidden');
  closeTwo();
  assert.equal(overflow(element), 'scroll');
  assert.equal(element.style.getPropertyPriority('overflow'), 'important');
});

test('a media query starts locking only when it matches and fully releases on disposal', () => {
  const element = body(), media = new FakeMedia(false);
  element.style.setProperty('overflow', 'auto');
  const dispose = lockBodyScrollWhen(query(media), element);
  assert.equal(overflow(element), 'auto');
  media.change(true);
  assert.equal(overflow(element), 'hidden');
  dispose(); dispose();
  assert.equal(overflow(element), 'auto');
  media.change(false); media.change(true);
  assert.equal(overflow(element), 'auto');
});

test('different document bodies keep independent owners and original values', () => {
  const first = body(), second = body();
  second.style.setProperty('overflow', 'clip');
  const releaseFirst = lockBodyScroll(first), releaseSecond = lockBodyScroll(second);
  releaseFirst();
  assert.equal(overflow(first), '');
  assert.equal(overflow(second), 'hidden');
  releaseSecond();
  assert.equal(overflow(second), 'clip');
});
