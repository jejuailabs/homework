'use client';

import {Fragment, useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {ArrowDownRight, ArrowUpRight, Bookmark, BookOpen, Check, ChevronLeft, ChevronRight, History, Info, LoaderCircle, Search, Square, Volume2, X} from 'lucide-react';
import {DICTIONARY_GRADES, DICTIONARY_PREVIEW_ENTRIES, DICTIONARY_SUGGESTIONS, dictionaryNarration, type DictionaryEntry, type DictionaryExplanation, type DictionaryGrade, type DictionaryLevel, type DictionarySearchResult} from '@/lib/korean-dictionary';
import {ttsPlayer} from '@/lib/tts-client';
import '@/styles/korean-dictionary.css';

type SavedWords = {entries: DictionaryEntry[]; recent: string[]};
const PAGE_SIZE = 20;
const BOOKMARK_LIMIT = 50;
const LEVEL_KEY = 'classroom-dictionary:level';
const LEVELS: {id: DictionaryLevel; ko: string; en: string; hint: string}[] = [
  {id: 'easy', ko: '아주 쉽게', en: 'Very easy', hint: '저학년'},
  {id: 'normal', ko: '보통', en: 'Standard', hint: '고학년'},
  {id: 'deep', ko: '깊이', en: 'In depth', hint: '사전 원문'},
];
const SOURCE_LABEL = {basic: ['한국어기초사전', 'Basic Korean Dictionary'], standard: ['표준국어대사전', 'Standard Korean Dictionary'], open: ['우리말샘', 'Urimalsaem'], ai: ['AI가 사전 뜻을 쉽게 풀었어요', 'AI wording of the dictionary meaning']} as const;

/** Shown in the sample preview and whenever the explanation cannot be loaded: the entry's own text. */
function ownExplanation(entry: DictionaryEntry, level: DictionaryLevel): DictionaryExplanation {
  return {id: entry.id, level, source: entry.source, fallback: false, word: entry.word, partOfSpeech: entry.partOfSpeech, pronunciation: '', origin: entry.originalWord, idioms: [], senses: entry.definition.split('\n').map(definition => ({definition, example: ''}))};
}
function isExplanation(value: unknown): value is DictionaryExplanation {
  const data = value as Partial<DictionaryExplanation> | null;
  return !!data && typeof data.word === 'string' && Array.isArray(data.senses) && data.senses.length > 0 && data.senses.every(sense => typeof sense?.definition === 'string' && typeof sense?.example === 'string') && Array.isArray(data.idioms);
}

function isEntry(value: unknown): value is DictionaryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return ['id', 'word', 'originalWord', 'partOfSpeech', 'definition', 'link', 'source', 'grade'].every(key => typeof entry[key] === 'string')
    && String(entry.id).length <= 100 && String(entry.word).length <= 500 && String(entry.definition).length <= 30000;
}

function sourceLink(link: string) {
  try {
    const url = new URL(link);
    return url.protocol === 'https:' && ['stdict.korean.go.kr', 'krdict.korean.go.kr', 'opendict.korean.go.kr'].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}

function previewResult(query: string, start: number, grade: DictionaryGrade | '' = ''): DictionarySearchResult {
  const found = DICTIONARY_PREVIEW_ENTRIES.filter(entry => entry.word.includes(query) && (!grade || entry.grade === grade));
  const entries = [...found.filter(entry => entry.word === query), ...found.filter(entry => entry.word !== query)];
  return {query, total: entries.length, start, num: PAGE_SIZE, entries: entries.slice(start - 1, start - 1 + PAGE_SIZE), source: 'basic'};
}

export default function KoreanDictionaryTool({locale, storageScope, preview = false}: {locale: 'ko' | 'en'; storageScope: string; preview?: boolean}) {
  const en = locale === 'en';
  const w = (ko: string, english: string) => en ? english : ko;
  const searchId = useId();
  const [query, setQuery] = useState(preview ? '마음' : '');
  const [result, setResult] = useState<DictionarySearchResult | null>(() => preview ? previewResult('마음', 1) : null);
  const [selectedId, setSelectedId] = useState<string | null>(() => preview ? previewResult('마음', 1).entries[0]?.id ?? null : null);
  const [tab, setTab] = useState<'search' | 'saved'>('search');
  const [saved, setSaved] = useState<SavedWords>({entries: [], recent: []});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [storageReady, setStorageReady] = useState(false);
  const [grade, setGrade] = useState<DictionaryGrade | ''>('');
  const [level, setLevel] = useState<DictionaryLevel>('normal');
  const [explanation, setExplanation] = useState<DictionaryExplanation | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainMessage, setExplainMessage] = useState('');
  const [voiceState, setVoiceState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [voiceMode, setVoiceMode] = useState<'device' | 'ai' | null>(null);
  const [voiceMessage, setVoiceMessage] = useState('');
  const [deviceVoiceAvailable, setDeviceVoiceAvailable] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const savedRef = useRef(saved);
  const input = useRef<HTMLInputElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const localVoice = useRef<SpeechSynthesisVoice | null>(null);
  const voiceVersion = useRef(0);
  const storageKey = `classroom-dictionary:${preview ? 'preview:' : ''}${storageScope}`;
  const visibleEntries = tab === 'saved' ? saved.entries : result?.entries ?? [];
  const selected = visibleEntries.find(entry => entry.id === selectedId) ?? visibleEntries[0];
  const selectedSaved = !!selected && saved.entries.some(entry => entry.id === selected.id);
  const selectedSource = selected ? sourceLink(selected.link) : null;

  useEffect(() => {
    requestVersion.current += 1;
    controller.current?.abort();
    controller.current = null;
    setPending(false);
    let next: SavedWords = {entries: [], recent: []};
    setStorageReady(false);
    setNotice('');
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const data: unknown = JSON.parse(raw);
        if (data && typeof data === 'object') {
          const value = data as Record<string, unknown>;
          next = {
            entries: Array.isArray(value.entries) ? value.entries.filter(isEntry).filter((entry, index, entries) => entries.findIndex(item => item.id === entry.id) === index).slice(0, BOOKMARK_LIMIT) : [],
            recent: Array.isArray(value.recent) ? value.recent.filter((item): item is string => typeof item === 'string' && item.length > 0 && [...item].length <= 80).slice(0, 8) : [],
          };
        }
      }
    } catch {
      setNotice(en ? 'This browser could not read your wordbook. Saving may be unavailable.' : '이 브라우저에서 단어장을 읽지 못했어요. 저장 기능이 제한될 수 있어요.');
    }
    savedRef.current = next;
    setSaved(next);
    setStorageReady(true);
  }, [storageKey, en]);

  useEffect(() => () => {
    requestVersion.current += 1;
    controller.current?.abort();
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LEVEL_KEY);
      if (LEVELS.some(item => item.id === stored)) setLevel(stored as DictionaryLevel);
    } catch {}
  }, []);

  useEffect(() => {
    if (!selected) {setExplanation(null); setExplainMessage(''); return;}
    setExplainMessage('');
    if (preview) {setExplanation(ownExplanation(selected, level)); return;}
    const abort = new AbortController();
    setExplanation(null);
    setExplaining(true);
    void (async () => {
      try {
        const response = await fetch(`/api/tools/dictionary/explain?${new URLSearchParams({id: selected.id, level, ...(selected.source === 'open' ? {word: selected.word} : {})})}`, {signal: abort.signal, cache: 'no-store'});
        const body: unknown = await response.json();
        if (!response.ok || !isExplanation(body)) throw new Error('EXPLAIN_FAILED');
        if (!abort.signal.aborted) setExplanation(body);
      } catch {
        if (abort.signal.aborted) return;
        setExplanation(ownExplanation(selected, level));
        setExplainMessage(w('이 단계의 해설을 불러오지 못해 사전 뜻풀이를 보여 드려요.', 'Could not load this level, so the dictionary meaning is shown.'));
      } finally {
        if (!abort.signal.aborted) setExplaining(false);
      }
    })();
    return () => abort.abort();
    // The entry id decides what is fetched; the rest of the entry never changes for one id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, level, preview]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const synthesis = window.speechSynthesis;
    const updateVoices = () => {
      const voices = synthesis.getVoices().filter(voice => /^ko(?:[-_]|$)/i.test(voice.lang));
      localVoice.current = voices.find(voice => voice.localService) ?? voices[0] ?? null;
      setDeviceVoiceAvailable(!!localVoice.current);
    };
    updateVoices();
    synthesis.addEventListener('voiceschanged', updateVoices);
    return () => synthesis.removeEventListener('voiceschanged', updateVoices);
  }, []);

  useEffect(() => {
    stopVoice();
    setVoiceMessage('');
    return () => stopVoice(false);
  }, [selected?.id, selected?.definition, level, preview]);

  function stopVoice(updateState = true) {
    voiceVersion.current += 1;
    if (audio.current) {
      audio.current.onended = null;
      audio.current.onerror = null;
      audio.current.pause();
      audio.current.removeAttribute('src');
      audio.current.load();
      audio.current = null;
    }
    if (utterance.current && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      utterance.current.onend = null;
      utterance.current.onerror = null;
      utterance.current = null;
      window.speechSynthesis.cancel();
    }
    if (updateState) {setVoiceState('idle'); setVoiceMode(null);}
  }

  function finishVoice(version: number) {
    if (version !== voiceVersion.current) return;
    utterance.current = null;
    audio.current = null;
    setVoiceState('idle');
    setVoiceMode(null);
  }

  function playDevice(pieces: string[], index: number, version: number) {
    if (version !== voiceVersion.current) return;
    if (index >= pieces.length) {finishVoice(version); return;}
    if (!('speechSynthesis' in window) || !localVoice.current) {
      finishVoice(version);
      setVoiceMessage(w('이 기기에는 한국어 음성이 없어요. AI 나레이션으로 들어 보세요.', 'This device has no Korean voice. Try the AI narration.'));
      return;
    }
    const speech = new SpeechSynthesisUtterance(pieces[index]);
    speech.voice = localVoice.current;
    speech.lang = localVoice.current.lang;
    speech.rate = 0.95;
    speech.onend = () => playDevice(pieces, index + 1, version);
    speech.onerror = () => {
      finishVoice(version);
      if (version === voiceVersion.current) setVoiceMessage(w('기기 음성을 재생하지 못했어요.', 'The device voice could not be played.'));
    };
    utterance.current = speech;
    setVoiceState('playing');
    window.speechSynthesis.speak(speech);
  }

  async function playAi(pieces: string[], index: number, version: number) {
    if (version !== voiceVersion.current) return;
    if (index >= pieces.length) {finishVoice(version); return;}
    setVoiceState('loading');
    const toDevice = () => {
      if (version !== voiceVersion.current) return;
      audio.current = null;
      setVoiceMode('device');
      setVoiceMessage(w('지금은 AI 나레이션을 쓸 수 없어 기기 음성으로 읽어요.', 'AI narration is unavailable, so the device voice is reading.'));
      playDevice(pieces, index, version);
    };
    try {
      const url = await ttsPlayer().link(pieces[index], {lang: 'ko', voice: 'bright', source: 'dictionary'});
      if (version !== voiceVersion.current) return;
      if (!url) {toDevice(); return;}
      const player = new Audio();
      player.preload = 'none';
      player.src = url;
      audio.current = player;
      player.onended = () => void playAi(pieces, index + 1, version);
      player.onerror = toDevice;
      await player.play();
      if (version === voiceVersion.current && audio.current === player) setVoiceState('playing');
    } catch {
      toDevice();
    }
  }

  function listen(mode: 'device' | 'ai') {
    if (!explanation) return;
    const same = voiceState !== 'idle' && voiceMode === mode;
    stopVoice();
    setVoiceMessage('');
    if (same) return;
    const pieces = dictionaryNarration(explanation);
    if (!pieces.length) return;
    const version = ++voiceVersion.current;
    setVoiceMode(mode);
    if (mode === 'device') playDevice(pieces, 0, version); else void playAi(pieces, 0, version);
  }

  function chooseLevel(next: DictionaryLevel) {
    setLevel(next);
    try {localStorage.setItem(LEVEL_KEY, next);} catch {}
  }

  function chooseGrade(next: DictionaryGrade | '') {
    setGrade(next);
    if (result) void search(result.query, 1, next);
  }

  function persist(next: SavedWords, successMessage = '') {
    if (!storageReady) return false;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      savedRef.current = next;
      setSaved(next);
      if (successMessage) setNotice(successMessage);
      return true;
    } catch {
      setNotice(w('브라우저 저장 공간에 접근할 수 없어 저장하지 못했어요.', 'Could not save because browser storage is unavailable.'));
      return false;
    }
  }

  async function search(value: string, start = 1, searchGrade = grade) {
    const cleanQuery = value.trim().normalize('NFC');
    if (!cleanQuery || [...cleanQuery].length > 80) {
      setError(w('찾을 낱말을 1~80자로 입력해 주세요.', 'Enter a word of 1–80 characters.'));
      input.current?.focus();
      return;
    }
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const version = ++requestVersion.current;
    setQuery(cleanQuery);
    setTab('search');
    setError('');
    setNotice('');
    setResult(null);
    setSelectedId(null);
    setPending(true);
    let timedOut = false;
    const timeout = preview ? undefined : setTimeout(() => {timedOut = true; abort.abort();}, 15000);
    try {
      let data: DictionarySearchResult;
      if (preview) {
        data = previewResult(cleanQuery, start, searchGrade);
      } else {
        const params = new URLSearchParams({q: cleanQuery, start: String(start), match: 'both', ...(searchGrade ? {grade: searchGrade} : {})});
        const response = await fetch(`/api/tools/dictionary?${params}`, {signal: abort.signal, cache: 'no-store'});
        const body = await response.json();
        if (!response.ok) {
          const messages: Record<string, string> = {
            UNAUTHENTICATED: w('로그인한 뒤 다시 찾아 주세요.', 'Please sign in to search.'),
            FORBIDDEN: w('선생님 계정에서 사용할 수 있어요.', 'This tool is available to teachers.'),
            DICTIONARY_NOT_CONFIGURED: w('사전 연결을 준비하고 있어요. 잠시 뒤 다시 이용해 주세요.', 'The dictionary connection is being prepared. Please try again later.'),
          };
          throw new Error(messages[body?.code] || (!en && typeof body?.error === 'string' ? body.error : w('사전을 불러오지 못했어요. 잠시 뒤 다시 찾아 주세요.', 'Could not load the dictionary. Please try again.')));
        }
        if (!body || !Array.isArray(body.entries) || !body.entries.every(isEntry) || !Number.isSafeInteger(body.total) || body.total < 0 || body.start !== start || typeof body.query !== 'string') {
          throw new Error(w('사전의 응답을 읽지 못했어요. 다시 찾아 주세요.', 'The dictionary response could not be read. Please try again.'));
        }
        data = body;
      }
      if (version !== requestVersion.current || abort.signal.aborted) return;
      setResult(data);
      setSelectedId(data.entries[0]?.id ?? null);
      const current = savedRef.current;
      persist({...current, recent: [cleanQuery, ...current.recent.filter(item => item !== cleanQuery)].slice(0, 8)});
    } catch (cause) {
      if (version !== requestVersion.current || (abort.signal.aborted && !timedOut)) return;
      setError(timedOut ? w('연결이 늦어지고 있어요. 잠시 뒤 다시 찾아 주세요.', 'The connection timed out. Please try again.') : cause instanceof Error ? cause.message : w('연결을 확인하고 다시 찾아 주세요.', 'Check your connection and try again.'));
    } finally {
      clearTimeout(timeout);
      if (version === requestVersion.current) {
        setPending(false);
        controller.current = null;
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {event.preventDefault(); void search(query);}

  function toggleBookmark() {
    if (!selected) return;
    const current = savedRef.current;
    const exists = current.entries.some(entry => entry.id === selected.id);
    if (!exists && current.entries.length >= BOOKMARK_LIMIT) {
      setNotice(w('단어장은 50개까지 담을 수 있어요. 먼저 다른 낱말을 지워 주세요.', 'Your wordbook holds up to 50 words. Remove a word before adding another.'));
      return;
    }
    persist({...current, entries: exists ? current.entries.filter(entry => entry.id !== selected.id) : [selected, ...current.entries]}, exists ? w('단어장에서 꺼냈어요.', 'Removed from your wordbook.') : w('이 브라우저의 단어장에 담았어요.', 'Saved to the wordbook in this browser.'));
  }

  function choose(entry: DictionaryEntry) {
    setSelectedId(entry.id);
    requestAnimationFrame(() => detailHeading.current?.focus({preventScroll: true}));
  }

  return <section className="kdict" aria-label={w('국어사전', 'Korean dictionary')}>
    <div className="kdict-paper">
      {preview && <div className="kdict-preview"><span/><strong>{w('화면 시안 · 예시 데이터', 'Design preview · sample data')}</strong><span>{w('검색과 단어장을 미리 체험해 보세요', 'Try search and the wordbook')}</span></div>}
      <header className="kdict-header">
        <div className="kdict-brand"><span className="kdict-mark" aria-hidden="true"><BookOpen size={25} strokeWidth={1.5}/></span><div><p>{w('함께 배우는 우리말', 'LET’S LEARN KOREAN')}</p><h2>{w('우리말 탐험 사전', 'Korean word explorer')}</h2></div></div>
        <div className="kdict-source"><span>{w('국립국어원 한국어기초사전 · 표준국어대사전', 'Basic and Standard Korean Dictionaries')}</span><small>{w('쉬운 뜻부터 자세한 뜻까지', 'From easy to detailed meanings')}</small></div>
      </header>

      <div className="kdict-intro"><div><p className="kdict-eyebrow">{w('모찌와 함께 낱말 탐험!', 'EXPLORE WORDS WITH MOCHI!')}</p><h3>{w('이 말은', 'What does')} <em>{w('무슨 뜻일까?', 'this word mean?')}</em></h3><p>{w('궁금한 말은 찾아보고, 소리로 듣고, 단어장에 쏙!', 'Look it up, listen, and save it in your wordbook!')}</p></div><div className="kdict-friends" aria-hidden="true"><span className="kdict-friend-bubble">{w('어떤 말이 궁금해?', 'What word are you curious about?')}</span><span className="kdict-friends-ground"/><img className="kdict-friend-dog" src="/characters/dog-dubu.webp" alt=""/><img className="kdict-friend-cat" src="/characters/cat-mochi.webp" alt=""/><span className="kdict-friend-star">✧</span></div></div>

      <form className="kdict-search-form" onSubmit={submit} role="search" aria-label={w('국어사전 낱말 검색', 'Search Korean words')}>
        <label className="kdict-sr-only" htmlFor={searchId}>{w('찾을 낱말', 'Word to find')}</label>
        <div className="kdict-search-box"><Search size={22} aria-hidden="true"/><input id={searchId} ref={input} value={query} maxLength={160} onChange={event => setQuery(event.target.value)} placeholder={w('궁금한 낱말을 써 봐! 예: 마음', 'Try a word, like 마음')} autoComplete="off" spellCheck={false}/>{query && <button type="button" className="kdict-clear" aria-label={w('검색어 지우기', 'Clear search')} onClick={() => {setQuery(''); input.current?.focus();}}><X size={17}/></button>}<button className="kdict-search-submit" type="submit" disabled={pending}>{pending ? <LoaderCircle size={17} className="spin"/> : <Search size={17}/>}<span>{w('찾기', 'Search')}</span></button></div>
        <div className="kdict-search-options"><span>{preview ? w('예시 낱말만 검색돼요', 'Searches sample words only') : w('낱말을 입력하고 찾기를 눌러 주세요', 'Enter a word, then select Search')}</span></div>
        <div className="kdict-grades" role="group" aria-label={w('난이도로 거르기', 'Filter by level')}><span>{w('난이도', 'Level')}</span><button type="button" aria-pressed={grade === ''} onClick={() => chooseGrade('')}>{w('전체', 'All')}</button>{DICTIONARY_GRADES.map(item => <button type="button" key={item} data-grade={item} aria-pressed={grade === item} onClick={() => chooseGrade(item)}>{item}</button>)}</div>
      </form>

      <div className="kdict-suggestions"><span>{w('함께 찾아요', 'Try a word')}</span>{DICTIONARY_SUGGESTIONS.map(word => <button type="button" key={word} onClick={() => void search(word)}>{word}<ArrowDownRight size={12}/></button>)}</div>
      <nav className="kdict-tabs" aria-label={w('사전 보기', 'Dictionary views')}><button type="button" aria-pressed={tab === 'search'} onClick={() => {setTab('search'); setSelectedId(result?.entries[0]?.id ?? null);}}><Search size={16}/>{w('낱말 찾기', 'Search')}</button><button type="button" aria-pressed={tab === 'saved'} onClick={() => {setTab('saved'); setSelectedId(saved.entries[0]?.id ?? null);}}><Bookmark size={16}/>{w('나의 단어장', 'My wordbook')}<span>{saved.entries.length}</span></button><small>{w('뜻을 알아가는 작은 습관', 'A small habit of discovering words')}</small></nav>

      {error && <div className="kdict-error" role="alert"><Info size={18}/><span>{error}</span></div>}
      {pending && tab === 'search' ? <div className="kdict-empty" role="status"><LoaderCircle size={30} className="spin"/><h3>{w('낱말의 뜻을 찾고 있어요', 'Looking up the word')}</h3><p>{w('잠시만 기다려 주세요.', 'Please wait a moment.')}</p></div> : visibleEntries.length > 0 ? <div className="kdict-results">
        <aside className="kdict-results-list" aria-label={tab === 'saved' ? w('단어장 목록', 'Saved words') : w('검색 결과 목록', 'Search results')}>
          {tab === 'search' && result?.entries[0]?.source === 'open' && <p className="kdict-fallback">{w('두 사전에 없어 우리말샘에서 찾았어요. 우리말샘은 많은 사람이 함께 만드는 사전이에요.', 'Found in Urimalsaem, a dictionary many people build together.')}</p>}
          {tab === 'search' && result?.entries[0]?.source === 'standard' && <p className="kdict-fallback">{w('기초사전에 없어 표준국어대사전에서 찾았어요.', 'Not in the Basic Dictionary, so these come from the Standard Dictionary.')}</p>}
          <div className="kdict-list-heading"><span>{tab === 'saved' ? w('모아 둔 낱말', 'Collected words') : <>‘{result?.query}’ {w('검색 결과', 'results')}</>}</span><strong>{(tab === 'saved' ? saved.entries.length : result?.total ?? 0).toLocaleString(en ? 'en-US' : 'ko-KR')}<small>{w('개', ' words')}</small></strong></div>
          <div className="kdict-word-list">{visibleEntries.map((entry, index) => <Fragment key={entry.id}>{tab === 'search' && index > 0 && visibleEntries[index - 1].word === result?.query && entry.word !== result?.query && <p className="kdict-list-divider">‘{result?.query}’{w('이 들어간 낱말', ' appears in')}</p>}<button type="button" className={selected?.id === entry.id ? 'is-selected' : ''} aria-pressed={selected?.id === entry.id} onClick={() => choose(entry)}><span className="kdict-word-title"><strong>{entry.word}</strong>{entry.partOfSpeech && <small>{entry.partOfSpeech}</small>}{entry.grade && <small className="kdict-grade" data-grade={entry.grade}>{entry.grade}</small>}{saved.entries.some(item => item.id === entry.id) && <Bookmark size={13} aria-label={w('단어장에 저장됨', 'Saved in wordbook')}/>}</span><span className="kdict-word-snippet">{entry.definition}</span><ChevronRight size={15} aria-hidden="true"/></button></Fragment>)}</div>
          {tab === 'search' && result && result.total > PAGE_SIZE && <div className="kdict-pagination"><button type="button" disabled={result.start <= 1} aria-label={w('이전 검색 결과', 'Previous results')} onClick={() => void search(result.query, Math.max(1, result.start - PAGE_SIZE))}><ChevronLeft size={17}/></button><span>{Math.floor((result.start - 1) / PAGE_SIZE) + 1} / {Math.ceil(Math.min(result.total, 1000) / PAGE_SIZE)}</span><button type="button" disabled={result.start + PAGE_SIZE > result.total || result.start + PAGE_SIZE > 1000} aria-label={w('다음 검색 결과', 'Next results')} onClick={() => void search(result.query, result.start + PAGE_SIZE)}><ChevronRight size={17}/></button></div>}
        </aside>
        {selected && <article className="kdict-definition" aria-label={w('선택한 낱말 뜻풀이', 'Selected word definition')}>
          <div className="kdict-definition-top"><span className="kdict-entry-label">{w('낱말을 발견했어요!', 'WORD DISCOVERED!')}</span><button type="button" className={`kdict-bookmark${selectedSaved ? ' is-saved' : ''}`} disabled={!storageReady} aria-pressed={selectedSaved} onClick={toggleBookmark}>{selectedSaved ? <Check size={16}/> : <Bookmark size={16}/>}<span>{selectedSaved ? w('담았어요', 'Saved') : w('단어장에 쏙', 'Save word')}</span></button></div>
          <h3 className="kdict-entry-word" ref={detailHeading} tabIndex={-1}>{selected.word}</h3>
          <div className="kdict-entry-meta">{selected.partOfSpeech && <span>{selected.partOfSpeech}</span>}{selected.grade && <span className="kdict-grade" data-grade={selected.grade}>{selected.grade}</span>}{selected.originalWord && <span>{selected.originalWord}</span>}{explanation?.pronunciation && <span>[{explanation.pronunciation}]</span>}</div>
          <div className="kdict-levels" role="group" aria-label={w('해설 단계', 'Explanation level')}>{LEVELS.map(item => <button type="button" key={item.id} aria-pressed={level === item.id} onClick={() => chooseLevel(item.id)}><strong>{w(item.ko, item.en)}</strong>{!en && <small>{item.hint}</small>}</button>)}</div>
          <div className="kdict-meaning"><div>
            <div className="kdict-meaning-heading"><h4>{w('뜻풀이', 'Meaning')}{explanation && <small className={`kdict-origin${explanation.source === 'ai' ? ' is-ai' : ''}`}>{w(SOURCE_LABEL[explanation.source][0], SOURCE_LABEL[explanation.source][1])}</small>}</h4>
              <div className="kdict-voice-buttons">
                <button type="button" className="kdict-listen" onClick={() => listen('device')} disabled={!explanation || !deviceVoiceAvailable} aria-label={voiceMode === 'device' ? w('기기 음성 중지', 'Stop the device voice') : w('기기 음성으로 듣기', 'Listen with the device voice')}>{voiceMode === 'device' && voiceState === 'playing' ? <Square size={13}/> : <Volume2 size={15}/>}<span>{voiceMode === 'device' ? w('중지', 'Stop') : w('기기 음성', 'Device')}</span></button>
                <button type="button" className="kdict-listen kdict-listen-ai" onClick={() => listen('ai')} disabled={!explanation || preview} aria-label={voiceMode === 'ai' ? w('AI 나레이션 중지', 'Stop the AI narration') : w('AI 나레이션으로 듣기', 'Listen with AI narration')}>{voiceMode === 'ai' && voiceState === 'loading' ? <LoaderCircle size={15} className="spin"/> : voiceMode === 'ai' && voiceState === 'playing' ? <Square size={13}/> : <Volume2 size={15}/>}<b aria-hidden="true">AI</b><span>{voiceMode === 'ai' ? w('중지', 'Stop') : w('나레이션', 'Narrate')}</span></button>
              </div></div>
            {explaining && !explanation ? <p className="kdict-explaining" role="status"><LoaderCircle size={15} className="spin"/>{w('해설을 준비하고 있어요', 'Preparing the explanation')}</p> : <ol className="kdict-senses">{explanation?.senses.map((sense, index) => <li key={index}>{sense.heading && <h5>{sense.heading}</h5>}<div className="kdict-sense"><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><p>{sense.definition}</p>{sense.example && <p className="kdict-example">{sense.example}</p>}</div></div></li>)}</ol>}
            {explanation && explanation.idioms.length > 0 && <div className="kdict-idioms"><strong>{w('함께 쓰는 표현', 'Related expressions')}</strong><div>{explanation.idioms.map(idiom => <span key={idiom}>{idiom}</span>)}</div></div>}
            {explanation?.fallback && <small className="kdict-voice-hint">{w('지금은 쉬운 풀이를 만들 수 없어 사전 뜻풀이를 보여 드려요.', 'Easy wording is unavailable, so the dictionary meaning is shown.')}</small>}
            {explainMessage && <small className="kdict-voice-hint">{explainMessage}</small>}
            {!deviceVoiceAvailable && <small className="kdict-voice-hint">{w('기기 음성에는 이 기기의 한국어 음성이 필요해요.', 'The device voice needs a Korean voice on this device.')}</small>}
            <span className="kdict-voice-message" role="status" aria-live="polite">{voiceMessage}</span></div></div>
          <div className="kdict-think"><img className="kdict-think-friend" src="/characters/hamster-kong.webp" alt=""/><div><strong>{w('콩이의 작은 도전', 'Kong’s little challenge')}</strong><p>{w('이 낱말을 넣어 나만의 문장을 말해 볼까?', 'Can you make your own sentence with this word?')}</p></div></div>
          <footer className="kdict-definition-footer"><span>{preview ? w('화면 구성을 위한 예시 뜻풀이', 'Sample definition for this preview') : w('국립국어원 제공', 'Source: National Institute of Korean Language')}</span>{selectedSource && <a href={selectedSource} target="_blank" rel="noopener noreferrer">{w('사전 원문 보기', 'Open dictionary source')}<ArrowUpRight size={14}/></a>}</footer>
        </article>}
      </div> : <div className="kdict-empty"><span className="kdict-empty-icon"><BookOpen size={36} strokeWidth={1.25}/></span><h3>{tab === 'saved' ? w('기억하고 싶은 낱말을 담아 보세요', 'Collect words you want to remember') : result ? w('찾은 낱말이 없어요', 'No words found') : w('낱말 하나에서 시작하는 발견', 'A discovery begins with one word')}</h3><p>{tab === 'saved' ? w('뜻풀이 옆 ‘단어장에 담기’를 누르면 여기에 모여요.', 'Select “Save word” beside a definition to collect it here.') : result ? (preview ? w('이 시안에서는 마음·배려·탐구 등 예시 낱말을 찾아볼 수 있어요.', 'This preview contains sample words such as 마음, 배려 and 탐구.') : w('철자를 확인하고 다시 찾아보세요.', 'Check your spelling and try again.')) : w('궁금했던 우리말의 뜻을 천천히 알아가요.', 'Take a moment to discover the meaning of a Korean word.')}</p></div>}

      {tab === 'search' && saved.recent.length > 0 && <div className="kdict-recent"><span><History size={14}/>{w('최근 찾은 낱말', 'Recent searches')}</span><div>{saved.recent.map(word => <button type="button" key={word} onClick={() => void search(word)}>{word}</button>)}</div><button type="button" className="kdict-recent-clear" onClick={() => persist({...savedRef.current, recent: []}, w('최근 검색 기록을 지웠어요.', 'Cleared recent searches.'))}>{w('지우기', 'Clear')}</button></div>}
      <p className="kdict-notice" role="status" aria-live="polite">{notice}</p>
      <details className="kdict-guide"><summary><Info size={14}/>{w('사전별 안내', 'About the dictionaries')}<ChevronRight size={14}/></summary><div className="kdict-guide-content"><div><strong>{w('한국어기초사전', 'Korean Basic Dictionary')}<span>{w('기본 · 보통', 'Default · Standard')}</span></strong><p>{w('한국어 학습자를 위한 쉬운 풀이와 난이도', 'Accessible explanations and levels for Korean learners')}</p></div><div><strong>{w('표준국어대사전', 'Standard Korean Language Dictionary')}<span>{w('깊이', 'In depth')}</span></strong><p>{w('정확하고 자세한 뜻풀이', 'Precise, detailed definitions')}</p></div><div><strong>{w('우리말샘', 'Urimalsaem')}<span>{w('두 사전에 없을 때', 'When neither has it')}</span></strong><p>{w('지명과 새말까지 담은 참여형 사전', 'A collaborative dictionary with place names and new words')}</p></div><small>{w('‘아주 쉽게’는 AI가 사전 뜻풀이를 쉬운 말로 바꾼 것이에요.', '“Very easy” is AI wording of the dictionary meaning.')} {w('한국어기초사전의 초급·중급·고급은 한국어 학습 수준이며 초등학교 학년이 아닙니다.', 'The Basic Dictionary’s beginner, intermediate and advanced levels refer to Korean proficiency, not elementary school grades.')}</small></div></details>
      <footer className="kdict-footer"><span><BookOpen size={13}/>{w('국립국어원 한국어기초사전 · 표준국어대사전', 'NIKL Basic and Standard Korean Dictionaries')}</span><span>{w('단어장·최근 검색은 이 브라우저에만 저장돼요.', 'Wordbook and recent searches stay in this browser.')}</span></footer>
    </div>
  </section>;
}
