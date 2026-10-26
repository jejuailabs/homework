type ScrollLock = {count: number; value: string; priority: string};
const locks = new WeakMap<HTMLElement, ScrollLock>();

/** Each overlay releases only its own lock; cleanup order must not strand a page. */
export function lockBodyScroll(body: HTMLElement = document.body): () => void {
  let state = locks.get(body);
  if (!state) {
    state = {count: 0, value: body.style.getPropertyValue('overflow'), priority: body.style.getPropertyPriority('overflow')};
    locks.set(body, state);
    body.style.setProperty('overflow', 'hidden');
  }
  state.count++;
  const owned = state;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--owned.count > 0) return;
    locks.delete(body);
    if (owned.value) body.style.setProperty('overflow', owned.value, owned.priority);
    else body.style.removeProperty('overflow');
  };
}

/** Wide-screen galleries never capture or restore another overlay's body styles. */
export function lockBodyScrollWhen(media: MediaQueryList, body: HTMLElement = document.body): () => void {
  let release: (() => void) | undefined;
  const update = () => {
    if (media.matches) release ??= lockBodyScroll(body);
    else {release?.(); release = undefined;}
  };
  update();
  media.addEventListener('change', update);
  return () => {media.removeEventListener('change', update); release?.(); release = undefined;};
}
