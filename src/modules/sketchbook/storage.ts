import {SKETCH_FILE_FORMAT, normalizeManifest, type SketchManifest} from './document';

/**
 * Device-only storage. Layer bitmaps exceed localStorage, so each sketch is one IndexedDB
 * record (manifest + PNG blobs) keyed by the tool's storage scope. Nothing leaves the device.
 */
export type SavedSketch = {manifest: SketchManifest; images: Record<string, Blob | null>; savedAt: number};
const DB = 'ourclass-sketchbook', STORE = 'sketches';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {reject(new Error('indexeddb-unavailable')); return;}
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);};
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexeddb-open'));
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode), request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('indexeddb-transaction'));
    });
  } finally {db.close();}
}

export async function loadSketch(scope: string): Promise<SavedSketch | null> {
  const value = await run('readonly', store => store.get(scope)) as {manifest?: unknown; images?: Record<string, unknown>; savedAt?: number} | undefined;
  const manifest = normalizeManifest(value?.manifest);
  if (!value || !manifest) return null;
  const images: Record<string, Blob | null> = {};
  for (const layer of manifest.layers) {const blob = value.images?.[layer.id]; images[layer.id] = blob instanceof Blob ? blob : null;}
  return {manifest, images, savedAt: Number(value.savedAt) || 0};
}

export function saveSketch(scope: string, sketch: SavedSketch) {return run('readwrite', store => store.put(sketch, scope));}
export function deleteSketch(scope: string) {return run('readwrite', store => store.delete(scope));}

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);});

/** Editable original: one JSON file holding the manifest and each layer as a PNG data URL. */
export async function encodeSketchFile(sketch: SavedSketch) {
  const layers: Record<string, string | null> = {};
  for (const [id, blob] of Object.entries(sketch.images)) layers[id] = blob ? await blobToDataUrl(blob) : null;
  return new Blob([JSON.stringify({format: SKETCH_FILE_FORMAT, manifest: sketch.manifest, layers, savedAt: sketch.savedAt})], {type: 'application/json'});
}

export async function decodeSketchFile(file: Blob): Promise<SavedSketch | null> {
  if (file.size > 120 * 1024 ** 2) return null;
  let value: {format?: unknown; manifest?: unknown; layers?: Record<string, unknown>};
  try {value = JSON.parse(await file.text());} catch {return null;}
  const manifest = value?.format === SKETCH_FILE_FORMAT ? normalizeManifest(value.manifest) : null;
  if (!manifest) return null;
  const images: Record<string, Blob | null> = {};
  for (const layer of manifest.layers) {
    const url = value.layers?.[layer.id];
    images[layer.id] = typeof url === 'string' && url.startsWith('data:image/png;base64,') ? await (await fetch(url)).blob() : null;
  }
  return {manifest, images, savedAt: Date.now()};
}
