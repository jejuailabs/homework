import 'server-only';
import {bucket} from './admin';
import {stableReadWindow} from '../storage-cache';
import {isR2Path} from '../video-storage';
import {r2ReadUrl} from './r2';

export async function stableReadUrl(path: string, options: {responseDisposition?: string} = {}) {
  if (isR2Path(path)) return r2ReadUrl(path, {...stableReadWindow(), ...options});
  const [url] = await bucket().file(path).getSignedUrl({version: 'v4', action: 'read', ...stableReadWindow(), ...options});
  return url;
}
