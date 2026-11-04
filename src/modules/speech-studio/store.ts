'use client';
import {type Book} from './books';

/**
 * Device-only library. Book PDFs and generated read-aloud audio stay in this browser's IndexedDB,
 * scoped to the teacher, so uploading a book never publishes it anywhere.
 */
const DB = 'ourclass-speech-studio', BOOKS = 'books', FILES = 'files', VOICES = 'voices';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {reject(new Error('indexeddb-unavailable')); return;}
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      for (const name of [BOOKS, FILES, VOICES]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexeddb-open'));
  });
}
async function run<T>(store: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(store, mode), request = work(tx.objectStore(store));
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('indexeddb-transaction'));
    });
  } finally {db.close();}
}
const key = (scope: string, id: string) => `${scope}|${id}`;

export async function listBooks(scope: string): Promise<Book[]> {
  const range = IDBKeyRange.bound(`${scope}|`, `${scope}|￿`);
  const rows = await run<unknown[]>(BOOKS, 'readonly', store => store.getAll(range)) ?? [];
  return (rows as Book[]).filter(book => book && typeof book.id === 'string' && Array.isArray(book.pages)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function saveBook(scope: string, book: Book, pdf?: Blob) {
  await run(BOOKS, 'readwrite', store => {store.put(book, key(scope, book.id));});
  if (pdf) await run(FILES, 'readwrite', store => {store.put(pdf, key(scope, book.id));});
}
export async function loadPdf(scope: string, bookId: string) {
  const value = await run<unknown>(FILES, 'readonly', store => store.get(key(scope, bookId)));
  return value instanceof Blob ? value : null;
}
export async function deleteBook(scope: string, bookId: string) {
  await run(BOOKS, 'readwrite', store => {store.delete(key(scope, bookId));});
  await run(FILES, 'readwrite', store => {store.delete(key(scope, bookId));});
  await run(VOICES, 'readwrite', store => {store.delete(IDBKeyRange.bound(key(scope, `${bookId}|`), key(scope, `${bookId}|￿`)));});
}
export async function cachedVoice(scope: string, bookId: string, sentenceKey: string) {
  const value = await run<unknown>(VOICES, 'readonly', store => store.get(key(scope, `${bookId}|${sentenceKey}`)));
  return value instanceof Blob ? value : null;
}
export async function cacheVoice(scope: string, bookId: string, sentenceKey: string, audio: Blob) {
  await run(VOICES, 'readwrite', store => {store.put(audio, key(scope, `${bookId}|${sentenceKey}`));});
}
