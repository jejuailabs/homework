import 'server-only';
import {bucket} from './admin';
import {stableReadWindow} from '../storage-cache';

export async function stableReadUrl(path: string, options: {responseDisposition?: string} = {}) {
  const [url] = await bucket().file(path).getSignedUrl({version: 'v4', action: 'read', ...stableReadWindow(), ...options});
  return url;
}
