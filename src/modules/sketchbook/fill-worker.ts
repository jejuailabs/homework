import {fillRegion, fillWalls, type FillOptions, type FillReference} from './raster';

export type FillRequest = {id: number; width: number; height: number; data: Uint8ClampedArray<ArrayBuffer>; x: number; y: number; mode: FillReference; options: FillOptions};
export type FillResponse = {id: number; mask: Uint8Array | null};

export function runFill(request: Omit<FillRequest, 'id'>) {
  const walls = fillWalls(request, request.x, request.y, request.mode, request.options.tolerance);
  return fillRegion(walls, request.width, request.height, request.x, request.y, request.options);
}

// Worker entry: the page keeps drawing while a large region is measured.
const scope = globalThis as unknown as {onmessage: ((event: MessageEvent<FillRequest>) => void) | null; postMessage: (message: FillResponse, transfer: Transferable[]) => void; WorkerGlobalScope?: unknown};
if (typeof scope.WorkerGlobalScope !== 'undefined') {
  scope.onmessage = ({data}) => {
    const mask = runFill(data);
    scope.postMessage({id: data.id, mask}, mask ? [mask.buffer] : []);
  };
}
