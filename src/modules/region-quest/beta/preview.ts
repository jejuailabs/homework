import 'server-only';
import {buildRegionQuestPreview} from './document.mjs';
let preview: Promise<string> | undefined;
export function loadRegionQuestPreview(): Promise<string> {
  // Cache immutable sample source only; authorize each API request separately.
  preview ??= buildRegionQuestPreview().catch(error => {preview = undefined; throw error;});
  return preview;
}
