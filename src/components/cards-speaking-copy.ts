'use client';

import {zipParts} from '@/lib/zip-store';
import type {SpeakingFile} from '@/lib/cards-speaking';
import {usePreferences} from './providers';
import ko from '@/messages/cards-speaking-ko.json';
import en from '@/messages/cards-speaking-en.json';

export function useSpeakingCopy() {
  const {locale} = usePreferences(), c = locale === 'ko' ? ko : en;
  const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
  return {c, fill, locale};
}

/** Fetches every recording, stores them in one ZIP and hands it to the browser's download. */
export async function saveSpeakingZip(files: SpeakingFile[], zipName: string, onProgress: (done: number) => void) {
  const entries = [];
  for (const [index, file] of files.entries()) {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error('fetch_failed');
    entries.push({name: file.path, data: new Uint8Array(await response.arrayBuffer())});
    onProgress(index + 1);
  }
  const blob = new Blob(zipParts(entries) as BlobPart[], {type: 'application/zip'}), href = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = href; link.download = zipName; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
