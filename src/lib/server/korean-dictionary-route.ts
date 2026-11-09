import 'server-only';
import {createHash} from 'node:crypto';
import {after} from 'next/server';
import {dictionaryAiRequest, DICTIONARY_AI_VERSION, parseDictionaryAi, type DictionarySense, type DictionarySimplifyInput} from '@/lib/korean-dictionary';
import {db} from './admin';
import {recordAiReuse, recordExternalCall, runMeteredAi} from './ai';
import {completedAiText, providerFailure, readBoundedJson} from './ai-policy';
import {requireTeacher} from './auth';
import {createDictionaryHandlers} from './korean-dictionary';

const TOOL = 'dictionary-easy', REPLY_BYTES_MAX = 128 * 1024, PROVIDER_TIMEOUT_MS = 20_000;
const aiModel = () => process.env.OPENAI_MODEL?.trim() || 'gpt-6-luna';

/** One explanation per word, meaning set and level for every teacher: the same word is paid for once. */
async function simplify(uid: string, input: DictionarySimplifyInput): Promise<DictionarySense[] | null> {
  const model = aiModel(), key = createHash('sha256').update(JSON.stringify([DICTIONARY_AI_VERSION, model, input])).digest('hex'), ref = db().doc('dictionaryAiCache/' + key);
  try {
    const stored = (await ref.get()).data()?.senses;
    if (Array.isArray(stored)) {
      after(() => recordAiReuse(uid, '', TOOL, model, 0).catch(() => console.error('Dictionary reuse record failed')));
      return stored as DictionarySense[];
    }
    if (!process.env.OPENAI_API_KEY?.trim()) return null;
    const senses = await runMeteredAi(uid, TOOL, model, key, async observe => {
      const response = await fetch('https://api.openai.com/v1/responses', {method: 'POST', headers: {Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json'}, body: JSON.stringify(dictionaryAiRequest(input, model)), signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS), cache: 'no-store'});
      if (!response.ok) {await response.body?.cancel(); throw providerFailure(response.status);}
      const payload = await readBoundedJson(response, REPLY_BYTES_MAX);
      observe(payload);
      return parseDictionaryAi(completedAiText(payload), input.senses.length);
    });
    if (senses) await ref.set({senses, word: input.word, level: input.level, version: DICTIONARY_AI_VERSION, createdAt: new Date().toISOString()});
    return senses;
  } catch {
    // A busy or failed AI never hides the meaning: the caller shows the dictionary's own text.
    return null;
  }
}

const handlers = createDictionaryHandlers({
  authenticate: requireTeacher,
  fetch: (...args) => fetch(...args),
  now: Date.now,
  configuration: () => ({key: process.env.STDICT_API_KEY, basicKey: process.env.KRDICT_API_KEY, disabled: process.env.TOOLS_DISABLED}),
  record: event => after(() => (event.cached ? recordAiReuse(event.uid, '', event.tool, event.model, 0) : recordExternalCall(event.uid, event.tool, event.model, event.ok, event.durationMs)).catch(() => console.error('Dictionary usage record failed'))),
  simplify,
});
export const dictionaryRoute = handlers.search;
export const dictionaryExplainRoute = handlers.explain;
