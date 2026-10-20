/**
 * Browser-side resize for homework photos. Children use low-end phones on slow
 * networks, so this favours predictability over maximum savings: one image at a
 * time, an inline worker instead of an extra bundle, JPEG output (every mobile browser can encode it), and
 * any failure or slowness falls back to the untouched original.
 */
export const IMAGE_MAX_EDGE = 2000;
export const IMAGE_QUALITY = 0.82;
// Small photos are already cheap to send; decoding them would only cost time.
export const IMAGE_SKIP_BYTES = 600 * 1024;
// Very large sources (e.g. 100MP+ modes) can exhaust a phone's memory when decoded.
export const IMAGE_MAX_SOURCE_BYTES = 25 * 1024 ** 2;
export const IMAGE_MAX_SOURCE_PIXELS = 50_000_000;
export const IMAGE_TIMEOUT_MS = 8000;
const compressible = ['image/jpeg', 'image/png', 'image/webp'];

export type ImageCompressionResult = {file: File; compressed: boolean; reason: 'compressed' | 'small' | 'unsupported' | 'too-large' | 'not-smaller' | 'failed' | 'timeout'; ms: number};

export function targetSize(width: number, height: number, maxEdge = IMAGE_MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}

export function compressionPlan(type: string, size: number): ImageCompressionResult['reason'] | null {
  if (!compressible.includes(type)) return 'unsupported';
  if (size <= IMAGE_SKIP_BYTES) return 'small';
  if (size > IMAGE_MAX_SOURCE_BYTES) return 'too-large';
  return null;
}

export function jpegName(name: string) {return `${name.replace(/\.[^./\\]+$/, '') || 'photo'}.jpg`;}

// Runs decode, resize and JPEG encoding off the main thread so the page (spinner,
// buttons) keeps responding on slow phones. Inline source: no extra bundle to fetch.
const workerSource = `self.onmessage=async({data})=>{try{const bitmap=await createImageBitmap(data.file,{imageOrientation:'from-image'});try{if(bitmap.width*bitmap.height>data.maxPixels){self.postMessage({blob:null});return;}const scale=Math.min(1,data.maxEdge/Math.max(bitmap.width,bitmap.height)),width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale)),canvas=new OffscreenCanvas(width,height),context=canvas.getContext('2d');if(!context){self.postMessage({blob:null});return;}context.fillStyle='#fff';context.fillRect(0,0,width,height);context.imageSmoothingQuality='high';context.drawImage(bitmap,0,0,width,height);self.postMessage({blob:await canvas.convertToBlob({type:'image/jpeg',quality:data.quality})});}finally{bitmap.close();}}catch{self.postMessage({blob:null});}};`;
let workerUrl: string | null = null;

function workerSupported() {
  return typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function' && typeof URL.createObjectURL === 'function';
}

/** Resolves null when the photo cannot be resized; `timeout` also terminates the worker to free its memory. */
function encodeInWorker(file: File, timeoutMs: number): Promise<Blob | null | 'timeout'> {
  workerUrl ??= URL.createObjectURL(new Blob([workerSource], {type: 'text/javascript'}));
  const worker = new Worker(workerUrl);
  return new Promise(resolve => {
    const finish = (value: Blob | null | 'timeout') => {clearTimeout(timer); worker.terminate(); resolve(value);};
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    worker.onmessage = event => finish(event.data?.blob instanceof Blob ? event.data.blob : null);
    worker.onerror = () => finish(null);
    worker.postMessage({file, maxEdge: IMAGE_MAX_EDGE, quality: IMAGE_QUALITY, maxPixels: IMAGE_MAX_SOURCE_PIXELS});
  });
}

// Older browsers without OffscreenCanvas: same steps on the main thread.
async function encodeOnPage(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  // Applies EXIF rotation so phone photos keep their orientation after the resize.
  const bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
  try {
    if (bitmap.width * bitmap.height > IMAGE_MAX_SOURCE_PIXELS) return null;
    const size = targetSize(bitmap.width, bitmap.height), canvas = document.createElement('canvas');
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    // JPEG has no alpha; transparent PNG areas would otherwise turn black.
    context.fillStyle = '#fff'; context.fillRect(0, 0, size.width, size.height);
    context.imageSmoothingQuality = 'high'; context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', IMAGE_QUALITY));
    canvas.width = canvas.height = 0;
    return blob;
  } finally {bitmap.close();}
}

export async function compressImage(file: File, type = file.type): Promise<ImageCompressionResult> {
  const started = performance.now(), done = (result: Omit<ImageCompressionResult, 'ms'>) => ({...result, ms: Math.round(performance.now() - started)});
  const skip = compressionPlan(type, file.size);
  if (skip) return done({file, compressed: false, reason: skip});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const blob = workerSupported() ? await encodeInWorker(file, IMAGE_TIMEOUT_MS) : await Promise.race([encodeOnPage(file), new Promise<'timeout'>(resolve => {timer = setTimeout(() => resolve('timeout'), IMAGE_TIMEOUT_MS);})]);
    if (blob === 'timeout') return done({file, compressed: false, reason: 'timeout'});
    // Some browsers silently fall back to PNG when they cannot encode JPEG.
    if (!blob || blob.type !== 'image/jpeg') return done({file, compressed: false, reason: 'failed'});
    if (blob.size >= file.size) return done({file, compressed: false, reason: 'not-smaller'});
    return done({file: new File([blob], jpegName(file.name), {type: 'image/jpeg', lastModified: file.lastModified}), compressed: true, reason: 'compressed'});
  } catch {return done({file, compressed: false, reason: 'failed'});}
  finally {clearTimeout(timer);}
}
