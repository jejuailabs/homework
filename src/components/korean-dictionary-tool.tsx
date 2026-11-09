'use client';

import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {ArrowDownRight, ArrowUpRight, Bookmark, BookOpen, Check, ChevronLeft, ChevronRight, History, Info, LoaderCircle, Search, Square, Volume2, X} from 'lucide-react';
import {DICTIONARY_PREVIEW_ENTRIES, DICTIONARY_SUGGESTIONS, type DictionaryEntry, type DictionarySearchResult} from '@/lib/korean-dictionary';
import {ttsPlayer} from '@/lib/tts-client';
import {normalizeTtsText} from '@/lib/tts';
import '@/styles/korean-dictionary.css';

type Match = 'exact' | 'include';
type SavedWords = {entries: DictionaryEntry[]; recent: string[]};
const PAGE_SIZE = 20;
const BOOKMARK_LIMIT = 50;

function isEntry(value: unknown): value is DictionaryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return ['id', 'word', 'originalWord', 'partOfSpeech', 'definition', 'link'].every(key => typeof entry[key] === 'string')
    && String(entry.id).length <= 100 && String(entry.word).length <= 500 && String(entry.definition).length <= 30000;
}

function sourceLink(link: string) {
  try {
    const url = new URL(link);
    return url.protocol === 'https:' && url.hostname === 'stdict.korean.go.kr' ? url.href : null;
  } catch { return null; }
}

function previewResult(query: string, match: Match, start: number): DictionarySearchResult {
  const entries = DICTIONARY_PREVIEW_ENTRIES.filter(entry => match === 'exact' ? entry.word === query : entry.word.includes(query));
  return {query, total: entries.length, start, num: PAGE_SIZE, entries: entries.slice(start - 1, start - 1 + PAGE_SIZE)};
}

export default function KoreanDictionaryTool({locale, storageScope, preview = false}: {locale: 'ko' | 'en'; storageScope: string; preview?: boolean}) {
  const en = locale === 'en';
  const w = (ko: string, english: string) => en ? english : ko;
  const searchId = useId();
  const [query, setQuery] = useState(preview ? '마음' : '');
  const [match, setMatch] = useState<Match>('include');
  const [result, setResult] = useState<DictionarySearchResult | null>(() => preview ? previewResult('마음', 'include', 1) : null);
  const [resultMatch, setResultMatch] = useState<Match>('include');
  const [selectedId, setSelectedId] = useState<string | null>(() => preview ? previewResult('마음', 'include', 1).entries[0]?.id ?? null : null);
  const [tab, setTab] = useState<'search' | 'saved'>('search');
  const [saved, setSaved] = useState<SavedWords>({entries: [], recent: []});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [storageReady, setStorageReady] = useState(false);
  const [voiceState, setVoiceState] = useState<'idle' | 'loading' | 'playing'>('idle');
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
    if (!preview || !('speechSynthesis' in window)) return;
    const synthesis = window.speechSynthesis;
    const updateVoices = () => {
      localVoice.current = synthesis.getVoices().find(voice => voice.localService && /^ko(?:[-_]|$)/i.test(voice.lang)) ?? null;
      setDeviceVoiceAvailable(!!localVoice.current);
    };
    updateVoices();
    synthesis.addEventListener('voiceschanged', updateVoices);
    return () => synthesis.removeEventListener('voiceschanged', updateVoices);
  }, [preview]);

  useEffect(() => {
    stopVoice();
    setVoiceMessage('');
    return () => stopVoice(false);
  }, [selected?.id, selected?.definition, preview]);

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
    if (updateState) setVoiceState('idle');
  }

  async function readDefinition() {
    if (!selected) return;
    if (voiceState !== 'idle') {stopVoice(); setVoiceMessage(''); return;}
    const text = normalizeTtsText(`${selected.word}. ${selected.definition}`);
    setVoiceMessage('');
    if (text.length > 1000) {
      setVoiceMessage(w('이 뜻풀이는 음성 한도인 1,000자를 넘어서 읽을 수 없어요.', 'This definition exceeds the 1,000-character speech limit.'));
      return;
    }
    const version = ++voiceVersion.current;
    if (preview) {
      if (!('speechSynthesis' in window) || !localVoice.current) {
        setVoiceMessage(w('이 기기에 설치된 한국어 음성이 없어 미리 듣기를 사용할 수 없어요.', 'A Korean voice installed on this device is required for preview playback.'));
        return;
      }
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        setVoiceMessage(w('다른 음성 읽기가 끝난 뒤 다시 눌러 주세요.', 'Please wait until the other speech playback has finished.'));
        return;
      }
      const speech = new SpeechSynthesisUtterance(text);
      speech.voice = localVoice.current;
      speech.lang = localVoice.current.lang;
      speech.rate = 0.95;
      speech.onend = () => {
        if (version !== voiceVersion.current) return;
        utterance.current = null;
        setVoiceState('idle');
      };
      speech.onerror = () => {
        if (version !== voiceVersion.current) return;
        utterance.current = null;
        setVoiceState('idle');
        setVoiceMessage(w('기기 음성을 재생하지 못했어요.', 'The device voice could not be played.'));
      };
      utterance.current = speech;
      setVoiceState('playing');
      window.speechSynthesis.speak(speech);
      return;
    }
    setVoiceState('loading');
    try {
      const url = await ttsPlayer().link(text, {lang: 'ko', voice: 'bright'});
      if (version !== voiceVersion.current) return;
      if (!url) throw new Error('TTS_UNAVAILABLE');
      const player = new Audio();
      player.preload = 'none';
      player.src = url;
      audio.current = player;
      player.onended = () => {
        if (version !== voiceVersion.current) return;
        audio.current = null;
        setVoiceState('idle');
      };
      player.onerror = () => {
        if (version !== voiceVersion.current) return;
        stopVoice();
        setVoiceMessage(w('음성을 재생하지 못했어요. 잠시 뒤 다시 눌러 주세요.', 'Audio could not be played. Please try again later.'));
      };
      await player.play();
      if (version === voiceVersion.current && audio.current === player) setVoiceState('playing');
    } catch {
      if (version !== voiceVersion.current) return;
      stopVoice();
      setVoiceMessage(w('지금은 음성 서비스를 이용할 수 없어요. 잠시 뒤 다시 눌러 주세요.', 'The speech service is unavailable right now. Please try again later.'));
    }
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

  async function search(value: string, start = 1, searchMatch = match) {
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
        data = previewResult(cleanQuery, searchMatch, start);
      } else {
        const params = new URLSearchParams({q: cleanQuery, start: String(start), match: searchMatch});
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
      setResultMatch(searchMatch);
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
        <div className="kdict-brand"><span className="kdict-mark" aria-hidden="true"><BookOpen size={25} strokeWidth={1.5}/></span><div><p>KOREAN DICTIONARY</p><h2>{w('우리말 사전', 'Korean dictionary')}</h2></div></div>
        <div className="kdict-source"><span>{w('국립국어원 표준국어대사전', 'Standard Korean Language Dictionary')}</span><small>{w('일반·심화 어휘', 'General & advanced vocabulary')}</small></div>
      </header>

      <div className="kdict-intro"><div><p className="kdict-eyebrow">{w('하나의 낱말, 더 넓은 생각', 'ONE WORD, A WIDER WORLD')}</p><h3>{w('궁금한 낱말을', 'Find a word.')} <em>{w('만나 보세요.', 'Discover its meaning.')}</em></h3><p>{w('정확한 뜻을 찾고, 오래 기억하고 싶은 낱말을 모아요.', 'Explore meanings and collect the Korean words you want to remember.')}</p></div><span className="kdict-letter" aria-hidden="true">가<span>ㄴ</span></span></div>

      <form className="kdict-search-form" onSubmit={submit} role="search" aria-label={w('국어사전 낱말 검색', 'Search Korean words')}>
        <label className="kdict-sr-only" htmlFor={searchId}>{w('찾을 낱말', 'Word to find')}</label>
        <div className="kdict-search-box"><Search size={22} aria-hidden="true"/><input id={searchId} ref={input} value={query} maxLength={160} onChange={event => setQuery(event.target.value)} placeholder={w('어떤 낱말이 궁금한가요?', 'Which Korean word are you curious about?')} autoComplete="off" spellCheck={false}/>{query && <button type="button" className="kdict-clear" aria-label={w('검색어 지우기', 'Clear search')} onClick={() => {setQuery(''); input.current?.focus();}}><X size={17}/></button>}<button className="kdict-search-submit" type="submit" disabled={pending}>{pending ? <LoaderCircle size={17} className="spin"/> : <Search size={17}/>}<span>{w('찾기', 'Search')}</span></button></div>
        <div className="kdict-search-options"><div className="kdict-match" role="group" aria-label={w('검색 방식', 'Search mode')}><button type="button" aria-pressed={match === 'include'} onClick={() => setMatch('include')}>{w('포함한 낱말', 'Contains')}</button><button type="button" aria-pressed={match === 'exact'} onClick={() => setMatch('exact')}>{w('일치하는 낱말', 'Exact word')}</button></div><span>{preview ? w('예시 낱말만 검색돼요', 'Searches sample words only') : w('낱말을 입력하고 찾기를 눌러 주세요', 'Enter a word, then select Search')}</span></div>
      </form>

      <div className="kdict-suggestions"><span>{w('함께 찾아요', 'Try a word')}</span>{DICTIONARY_SUGGESTIONS.map(word => <button type="button" key={word} onClick={() => void search(word)}>{word}<ArrowDownRight size={12}/></button>)}</div>
      <nav className="kdict-tabs" aria-label={w('사전 보기', 'Dictionary views')}><button type="button" aria-pressed={tab === 'search'} onClick={() => {setTab('search'); setSelectedId(result?.entries[0]?.id ?? null);}}><Search size={16}/>{w('낱말 찾기', 'Search')}</button><button type="button" aria-pressed={tab === 'saved'} onClick={() => {setTab('saved'); setSelectedId(saved.entries[0]?.id ?? null);}}><Bookmark size={16}/>{w('나의 단어장', 'My wordbook')}<span>{saved.entries.length}</span></button><small>{w('뜻을 알아가는 작은 습관', 'A small habit of discovering words')}</small></nav>

      {error && <div className="kdict-error" role="alert"><Info size={18}/><span>{error}</span></div>}
      {pending && tab === 'search' ? <div className="kdict-empty" role="status"><LoaderCircle size={30} className="spin"/><h3>{w('낱말의 뜻을 찾고 있어요', 'Looking up the word')}</h3><p>{w('잠시만 기다려 주세요.', 'Please wait a moment.')}</p></div> : visibleEntries.length > 0 ? <div className="kdict-results">
        <aside className="kdict-results-list" aria-label={tab === 'saved' ? w('단어장 목록', 'Saved words') : w('검색 결과 목록', 'Search results')}>
          <div className="kdict-list-heading"><span>{tab === 'saved' ? w('모아 둔 낱말', 'Collected words') : <>‘{result?.query}’ {w('검색 결과', 'results')}</>}</span><strong>{(tab === 'saved' ? saved.entries.length : result?.total ?? 0).toLocaleString(en ? 'en-US' : 'ko-KR')}<small>{w('개', ' words')}</small></strong></div>
          <div className="kdict-word-list">{visibleEntries.map(entry => <button type="button" key={entry.id} className={selected?.id === entry.id ? 'is-selected' : ''} aria-pressed={selected?.id === entry.id} onClick={() => choose(entry)}><span className="kdict-word-title"><strong>{entry.word}</strong>{entry.partOfSpeech && <small>{entry.partOfSpeech}</small>}{saved.entries.some(item => item.id === entry.id) && <Bookmark size={13} aria-label={w('단어장에 저장됨', 'Saved in wordbook')}/>}</span><span className="kdict-word-snippet">{entry.definition}</span><ChevronRight size={15} aria-hidden="true"/></button>)}</div>
          {tab === 'search' && result && result.total > PAGE_SIZE && <div className="kdict-pagination"><button type="button" disabled={result.start <= 1} aria-label={w('이전 검색 결과', 'Previous results')} onClick={() => void search(result.query, Math.max(1, result.start - PAGE_SIZE), resultMatch)}><ChevronLeft size={17}/></button><span>{Math.floor((result.start - 1) / PAGE_SIZE) + 1} / {Math.ceil(Math.min(result.total, 1000) / PAGE_SIZE)}</span><button type="button" disabled={result.start + result.entries.length > result.total || result.entries.length === 0 || result.start + PAGE_SIZE > 1000} aria-label={w('다음 검색 결과', 'Next results')} onClick={() => void search(result.query, result.start + PAGE_SIZE, resultMatch)}><ChevronRight size={17}/></button></div>}
        </aside>
        {selected && <article className="kdict-definition" aria-label={w('선택한 낱말 뜻풀이', 'Selected word definition')}>
          <div className="kdict-definition-top"><span className="kdict-entry-label">{w('낱말 살펴보기', 'A CLOSER LOOK')}</span><button type="button" className={`kdict-bookmark${selectedSaved ? ' is-saved' : ''}`} disabled={!storageReady} aria-pressed={selectedSaved} onClick={toggleBookmark}>{selectedSaved ? <Check size={16}/> : <Bookmark size={16}/>}<span>{selectedSaved ? w('담았어요', 'Saved') : w('단어장에 담기', 'Save word')}</span></button></div>
          <h3 className="kdict-entry-word" ref={detailHeading} tabIndex={-1}>{selected.word}</h3>
          <div className="kdict-entry-meta">{selected.partOfSpeech && <span>{selected.partOfSpeech}</span>}{selected.originalWord && <span>{selected.originalWord}</span>}<span>{w('표준국어대사전', 'Standard Korean Dictionary')}</span></div>
          <div className="kdict-meaning"><span aria-hidden="true">01</span><div><div className="kdict-meaning-heading"><h4>{w('뜻풀이', 'Meaning')}</h4><button type="button" className="kdict-listen" onClick={() => void readDefinition()} disabled={preview && !deviceVoiceAvailable} aria-label={voiceState === 'idle' ? w('낱말과 뜻풀이 듣기', 'Listen to the word and definition') : w('음성 읽기 중지', 'Stop reading aloud')}>{voiceState === 'loading' ? <LoaderCircle size={15} className="spin"/> : voiceState === 'playing' ? <Square size={13}/> : <Volume2 size={15}/>}<span>{voiceState === 'loading' ? w('준비 중 · 중지', 'Loading · stop') : voiceState === 'playing' ? w('중지', 'Stop') : preview ? w('기기 음성으로 듣기', 'Device voice preview') : w('뜻풀이 듣기', 'Listen')}</span></button></div><p>{selected.definition}</p>{preview && !deviceVoiceAvailable && <small className="kdict-voice-hint">{w('미리 듣기에는 기기에 설치된 한국어 음성이 필요해요.', 'Preview requires a Korean voice installed on this device.')}</small>}<span className="kdict-voice-message" role="status" aria-live="polite">{voiceMessage}</span></div></div>
          <div className="kdict-think"><span className="kdict-think-symbol" aria-hidden="true">“</span><div><strong>{w('이 낱말로 어떤 이야기를 할 수 있을까요?', 'What story could you tell with this word?')}</strong><p>{w('뜻을 읽고, 나만의 문장으로 한 번 말해 보세요.', 'Read the meaning, then try saying a sentence of your own.')}</p></div></div>
          <footer className="kdict-definition-footer"><span>{preview ? w('화면 구성을 위한 예시 뜻풀이', 'Sample definition for this preview') : w('국립국어원 제공', 'Source: National Institute of Korean Language')}</span>{selectedSource && <a href={selectedSource} target="_blank" rel="noopener noreferrer">{w('사전 원문 보기', 'Open dictionary source')}<ArrowUpRight size={14}/></a>}</footer>
        </article>}
      </div> : <div className="kdict-empty"><span className="kdict-empty-icon"><BookOpen size={36} strokeWidth={1.25}/></span><h3>{tab === 'saved' ? w('기억하고 싶은 낱말을 담아 보세요', 'Collect words you want to remember') : result ? w('찾은 낱말이 없어요', 'No words found') : w('낱말 하나에서 시작하는 발견', 'A discovery begins with one word')}</h3><p>{tab === 'saved' ? w('뜻풀이 옆 ‘단어장에 담기’를 누르면 여기에 모여요.', 'Select “Save word” beside a definition to collect it here.') : result ? (preview ? w('이 시안에서는 마음·배려·탐구 등 예시 낱말을 찾아볼 수 있어요.', 'This preview contains sample words such as 마음, 배려 and 탐구.') : w('철자를 확인하거나 ‘포함한 낱말’로 다시 찾아보세요.', 'Check your spelling or try the “Contains” search mode.')) : w('궁금했던 우리말의 뜻을 천천히 알아가요.', 'Take a moment to discover the meaning of a Korean word.')}</p></div>}

      {tab === 'search' && saved.recent.length > 0 && <div className="kdict-recent"><span><History size={14}/>{w('최근 찾은 낱말', 'Recent searches')}</span><div>{saved.recent.map(word => <button type="button" key={word} onClick={() => void search(word)}>{word}</button>)}</div><button type="button" className="kdict-recent-clear" onClick={() => persist({...savedRef.current, recent: []}, w('최근 검색 기록을 지웠어요.', 'Cleared recent searches.'))}>{w('지우기', 'Clear')}</button></div>}
      <p className="kdict-notice" role="status" aria-live="polite">{notice}</p>
      <details className="kdict-guide"><summary><Info size={14}/>{w('사전별 안내', 'About the dictionaries')}<ChevronRight size={14}/></summary><div className="kdict-guide-content"><div><strong>{w('표준국어대사전', 'Standard Korean Language Dictionary')}<span>{w('현재 사전', 'Current source')}</span></strong><p>{w('정확하고 자세한 뜻풀이', 'Precise, detailed definitions')}</p></div><div><strong>{w('한국어기초사전', 'Korean Basic Dictionary')}<span>{w('별도 연결 필요', 'Separate connection required')}</span></strong><p>{w('한국어 학습자를 위한 쉬운 풀이', 'Accessible explanations for Korean learners')}</p></div><small>{w('사전의 성격을 안내하며, 개별 낱말의 난이도 등급은 아닙니다.', 'These describe the dictionaries, not difficulty ratings for individual words.')} {w('한국어기초사전의 초급·중급·고급은 한국어 학습 수준이며 초등학교 학년이 아닙니다.', 'The Basic Dictionary’s beginner, intermediate and advanced levels refer to Korean proficiency, not elementary school grades.')}</small></div></details>
      <footer className="kdict-footer"><span><BookOpen size={13}/>{w('국립국어원 표준국어대사전', 'Standard Korean Language Dictionary')}</span><span>{w('단어장·최근 검색은 이 브라우저에만 저장돼요.', 'Wordbook and recent searches stay in this browser.')}</span></footer>
    </div>
  </section>;
}
