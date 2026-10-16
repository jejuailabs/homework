'use client';

import {useEffect, useMemo, useRef, useState, type ChangeEvent} from 'react';
import {Check, ChevronDown, Download, Eye, Play, Printer, RefreshCw, Save, Sparkles, Upload} from 'lucide-react';
import {MATCHING_COUNTS, createMatchingDeck, matchingDeckSize, matchingPositions, matchingRandom, matchingShuffle, parseMatchingSettings, type MatchingCount, type MatchingSettings, type MatchingShape} from '@/lib/matching-deck';
import {MATCHING_PACK_IDS, MATCHING_PACKS, type MatchingAsset} from '@/lib/matching-assets';
import {printMatchingDeck} from '@/lib/matching-print';
import '@/styles/matching.css';

const DEFAULTS: MatchingSettings = {version: 1, title: '같은 그림 찾기', pack: 'animals', symbolsPerCard: 4, shape: 'circle', seed: 'moa-classroom', printCount: 13, labels: false};
function readSettings(value: unknown) {
  const settings = parseMatchingSettings(value, MATCHING_PACK_IDS);
  const pack = MATCHING_PACKS.find(item => item.id === settings.pack)!;
  if (settings.artwork?.some(id => !pack.assets.some(asset => asset.id === id))) throw new Error('Unknown artwork');
  return settings;
}

function PictureCard({card, assets, shape, labels, locale, onPick, revealed}: {card: number[]; assets: MatchingAsset[]; shape: MatchingShape; labels: boolean; locale: string; onPick?: (id: number) => void; revealed?: number}) {
  const positions = matchingPositions(card.length);
  return <div className={`matching-picture-card matching-shape-${shape}`}>
    <svg className="matching-outline" viewBox="0 0 100 100" aria-hidden="true">
      {shape === 'circle' ? <circle cx="50" cy="50" r="48"/> : shape === 'hexagon' ? <polygon points="50,1 92.44,25.5 92.44,74.5 50,99 7.56,74.5 7.56,25.5"/> : <rect x="2" y="2" width="96" height="96" rx="6"/>}
    </svg>
    {card.map((id, index) => {
      const asset = assets[id], position = positions[index];
      const name = locale === 'en' ? asset.en : asset.ko;
      const content = <><img src={asset.src} alt={name} draggable={false}/>{labels && <small>{name}</small>}</>;
      const style = {left: `${position.x}%`, top: `${position.y}%`, width: `${position.size}%`};
      return onPick ? <button key={id} type="button" className={'matching-symbol' + (revealed === id ? ' matching-found' : '')} style={style} onClick={() => onPick(id)} aria-label={name}>{content}</button>
        : <div key={id} className="matching-symbol" style={style}>{content}</div>;
    })}
  </div>;
}

export default function MatchingMaker({locale = 'ko', storageScope = 'teacher'}: {locale?: string; storageScope?: string}) {
  const en = locale === 'en';
  const l = (ko: string, english: string) => en ? english : ko;
  const [settings, setSettings] = useState<MatchingSettings>(() => ({...DEFAULTS, title: en ? 'Find the same picture' : DEFAULTS.title}));
  const [loadedScope, setLoadedScope] = useState('');
  const [tab, setTab] = useState<'make' | 'play'>('make');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [allCards, setAllCards] = useState(false);
  const [round, setRound] = useState(0);
  const [found, setFound] = useState<number>();
  const [answer, setAnswer] = useState('');
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [topic, setTopic] = useState('');
  const [grade, setGrade] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [aiKey, setAiKey] = useState('');
  const [pending, setPending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const storageKey = `homework-matching-v1:${storageScope}`;
  const pack = MATCHING_PACKS.find(item => item.id === settings.pack)!;
  const total = matchingDeckSize(settings.symbolsPerCard);
  const deck = useMemo(() => createMatchingDeck(settings.symbolsPerCard, settings.seed), [settings.symbolsPerCard, settings.seed]);
  const assets = useMemo(() => settings.artwork ? settings.artwork.map(id => pack.assets.find(asset => asset.id === id)!) : matchingShuffle<MatchingAsset>(pack.assets, matchingRandom(`${settings.seed}:pictures`)).slice(0, total), [pack, settings.artwork, settings.seed, total]);
  const cards = deck.slice(0, settings.printCount);
  const used = new Set(cards.flat()).size;
  const currentAiKey = JSON.stringify({topic, grade, pack: settings.pack, count: settings.symbolsPerCard, title: settings.title});
  const pair = [cards[(round * 2) % cards.length], cards[(round * 2 + 1) % cards.length]];

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setSettings(saved ? readSettings(JSON.parse(saved)) : {...DEFAULTS, title: en ? 'Find the same picture' : DEFAULTS.title});
    } catch { setSettings({...DEFAULTS, title: en ? 'Find the same picture' : DEFAULTS.title}); }
    setLoadedScope(storageKey);
  }, [storageKey, en]);
  useEffect(() => () => request.current?.abort(), []);

  function update(patch: Partial<MatchingSettings>) {
    setSettings(previous => ({...previous, ...patch}));
    setFound(undefined); setAnswer(''); setRound(0); setNotice(''); setError(''); setReplaceIndex(null);
  }
  function shuffle() {
    const random = crypto.getRandomValues(new Uint32Array(2));
    update({seed: `${random[0].toString(36)}-${random[1].toString(36)}`, artwork: undefined});
  }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); setNotice(l('이 브라우저에 카드 구성을 저장했어요.', 'Deck saved in this browser.')); setError(''); }
    catch { setError(l('브라우저에 저장하지 못했어요. 파일로 저장해 주세요.', 'Browser storage is unavailable. Export the deck file instead.')); }
  }
  function download() {
    const data = {kind: 'homework-matching-deck', settings: {...settings, artwork: assets.map(asset => asset.id)}, artworkCredits: assets.map(asset => ({id: asset.id, ...asset.source}))};
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = `${(settings.title || 'matching-deck').replace(/[<>:"/\\|?*]/g, '-')}.json`;
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(l('다른 기기에서도 불러올 수 있는 카드 파일을 저장했어요.', 'Exported a deck file you can import on another device.'));
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      if (file.size > 256 * 1024 || !file.name.toLowerCase().endsWith('.json')) throw new Error('file');
      const parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
      update(readSettings(parsed.kind === 'homework-matching-deck' ? parsed.settings : parsed));
      setNotice(l('카드 파일을 불러왔어요.', 'Deck file imported.'));
    } catch { setError(l('올바른 같은 그림 찾기 JSON 파일을 선택해 주세요.', 'Choose a valid same-picture deck JSON file.')); }
  }
  function chooseImage(id: number) {
    if (pair[0].includes(id) && pair[1].includes(id)) {setFound(id); setAnswer(l(`맞아요! 같은 그림은 ${assets[id].ko}예요.`, `Correct! The matching picture is ${assets[id].en}.`));}
    else {setAnswer(l('다른 카드에도 있는 그림을 찾아보세요.', 'Look for a picture that is also on the other card.'));}
  }
  async function askAi() {
    if (request.current || !topic.trim()) return;
    const controller = new AbortController(); request.current = controller;
    let timeoutReached = false;
    const timeout = setTimeout(() => {timeoutReached = true; controller.abort();}, 60000);
    setPending(true); setError('');
    try {
      const source = `수업 주제: ${topic.trim()}\n게임: 같은 그림 찾기\n그림 묶음: ${pack.ko}\n규칙: 서로 다른 두 카드에는 공통 그림이 정확히 하나입니다. 같은 그림 이름을 말하거나 가리킵니다. 카드 한 장당 그림 ${settings.symbolsPerCard}개.\n사용 가능한 그림: ${assets.map(asset => en ? asset.en : asset.ko).join(', ')}\n이 자료로 게임 전후에 활용할 학습 목표, 학생용 짧은 설명, 관찰 질문, 교사용 정리 활동을 준비합니다. 카드 조합은 이미 검증되어 있습니다. 새로운 그림을 생성했다고 주장하지 않습니다.`;
      const response = await fetch('/api/ai/generate', {method: 'POST', headers: {'Content-Type': 'application/json'}, signal: controller.signal, body: JSON.stringify({tool: 'resource', source, grade: grade.trim(), locale: en ? 'en' : 'ko'})});
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.text !== 'string' || !result.text.trim()) {
        const code = result?.code;
        throw new Error(code === 'AI_NOT_CONFIGURED' ? 'configuration' : code === 'AI_RATE_LIMIT' ? 'quota' : response.status === 401 ? 'session' : 'response');
      }
      setAiResult(result.text.slice(0, 20000)); setAiKey(currentAiKey);
    } catch (failure) {
      if (controller.signal.aborted && !timeoutReached) return;
      const code = failure instanceof Error ? failure.message : '';
      setError(code === 'configuration' ? l('AI 연결 설정이 필요해요. 카드 제작과 인쇄는 바로 사용할 수 있어요.', 'AI is not configured. You can still make and print cards.') : code === 'quota' ? l('AI 사용 한도에 도달했어요. 잠시 뒤 다시 시도해 주세요.', 'AI usage limit reached. Try again later.') : code === 'session' ? l('로그인 후 다시 시도해 주세요.', 'Sign in again to use AI.') : l('AI 초안을 가져오지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'Could not get an AI draft. Try again shortly.'));
    } finally {clearTimeout(timeout); if (request.current === controller) request.current = null; setPending(false);}
  }

  return <div className="matching-maker" aria-busy={loadedScope !== storageKey}>
    <header className="matching-heading"><div><span className="matching-eyebrow">PICTURE PLAY <span>✦ AI</span></span><h2>{l('같은 그림 찾기', 'Find the same picture')}</h2><p>{l('어떤 두 카드에도 같은 그림은 딱 하나. 우리 반만의 카드 놀이를 만들어 보세요.', 'Every two cards share exactly one picture. Make a picture game for your class.')}</p></div><img src="/characters/otter-moa.webp" alt="" width="100" height="100" onError={event => {event.currentTarget.style.visibility = 'hidden';}}/></header>
    <div className="matching-tabs" role="group" aria-label={l('작업 선택', 'Choose view')}><button type="button" aria-pressed={tab === 'make'} onClick={() => setTab('make')}><Eye size={17}/>{l('카드 만들기', 'Make cards')}</button><button type="button" aria-pressed={tab === 'play'} onClick={() => {setTab('play'); setFound(undefined); setAnswer('');}}><Play size={17}/>{l('화면으로 놀이', 'Play on screen')}</button></div>

    {tab === 'make' ? <>
      <div className="matching-workspace">
        <section className="matching-settings" aria-label={l('카드 설정', 'Card settings')}>
          <label htmlFor="matching-title">{l('카드 이름', 'Deck name')}</label><input id="matching-title" value={settings.title} maxLength={80} onChange={event => update({title: event.target.value})}/>
          <label htmlFor="matching-pack">{l('그림 묶음', 'Picture pack')}</label><select id="matching-pack" value={settings.pack} onChange={event => update({pack: event.target.value, artwork: undefined})}>{MATCHING_PACKS.map(item => <option key={item.id} value={item.id}>{en ? item.en : item.ko} · {item.assets.length}{l('종', ' pictures')}</option>)}</select>
          <label htmlFor="matching-count">{l('한 카드의 그림 수', 'Pictures per card')}</label><select id="matching-count" value={settings.symbolsPerCard} onChange={event => {const count = Number(event.target.value) as MatchingCount; update({symbolsPerCard: count, printCount: matchingDeckSize(count), artwork: undefined});}}>{MATCHING_COUNTS.map(count => <option key={count} value={count}>{count}{l('개', ' pictures')} → {matchingDeckSize(count)}{l('장', ' cards')}</option>)}</select>
          <fieldset className="matching-shapes"><legend>{l('카드 모양', 'Card shape')}</legend>{(['circle', 'hexagon', 'square'] as const).map((shape, index) => <button key={shape} type="button" aria-pressed={settings.shape === shape} onClick={() => update({shape})}><svg viewBox="0 0 30 30" width="26" height="26" aria-hidden="true">{shape === 'circle' ? <circle cx="15" cy="15" r="11"/> : shape === 'hexagon' ? <polygon points="15,2 27,8.5 27,21.5 15,28 3,21.5 3,8.5"/> : <rect x="4" y="4" width="22" height="22" rx="3"/>}</svg>{[l('원형', 'Circle'), l('육각형', 'Hexagon'), l('사각형', 'Square')][index]}</button>)}</fieldset>
          <label htmlFor="matching-print-count">{l('이번에 사용할 카드', 'Cards to use')} <strong>{settings.printCount}{l('장', ' cards')}</strong></label><input id="matching-print-count" type="range" min={2} max={total} value={settings.printCount} onChange={event => update({printCount: Number(event.target.value)})}/>
          <label className="matching-checkbox"><input type="checkbox" checked={settings.labels} onChange={event => update({labels: event.target.checked})}/>{l('그림 이름 함께 표시', 'Show picture names')}</label>
          <button type="button" className="button" onClick={shuffle}><RefreshCw size={16}/>{l('새 카드 구성', 'Shuffle deck')}</button>
          <p className="matching-help">{l('완성 덱에서 일부만 골라도 공통 그림 규칙이 유지돼요.', 'The matching rule holds when you use only part of the complete deck.')}</p>
        </section>
        <section className="matching-preview" aria-label={l('카드 미리보기', 'Card preview')}>
          <div className="matching-stats"><span><strong>{total}</strong>{l('전체 카드', 'Complete deck')}</span><span><strong>{settings.printCount}</strong>{l('사용할 카드', 'Selected cards')}</span><span><strong>{used}</strong>{l('사용할 그림', 'Pictures used')}</span></div>
          <div className="matching-preview-pair">{cards.slice(0, 2).map((card, index) => <PictureCard key={index} card={card} assets={assets} shape={settings.shape} labels={settings.labels} locale={locale}/>)}</div>
          <p className="matching-rule"><Check size={16}/>{l('두 카드 사이에 같은 그림이 하나씩 있도록 자동 구성했어요.', 'Every pair of cards has exactly one matching picture.')}</p>
          <div className="matching-actions"><button type="button" className="button primary" onClick={() => {if (!printMatchingDeck(settings, cards, assets, locale)) setError(l('인쇄 창이 차단됐어요. 이 사이트의 팝업을 허용해 주세요.', 'Allow pop-ups for this site to open the print layout.'));}}><Printer size={17}/>{l('인쇄 · PDF', 'Print · PDF')}</button><button type="button" className="button" onClick={save} disabled={loadedScope !== storageKey}><Save size={16}/>{l('브라우저 저장', 'Save here')}</button><button type="button" className="button" onClick={download}><Download size={16}/>{l('파일 저장', 'Export')}</button><button type="button" className="button" onClick={() => fileInput.current?.click()}><Upload size={16}/>{l('불러오기', 'Import')}</button><input ref={fileInput} type="file" accept=".json,application/json" onChange={importFile} hidden/></div>
          <p className="matching-help">{l('A4에 6장씩 출력해요. PDF로 저장하려면 인쇄 창에서 대상을 선택해 주세요.', 'Print six cards per A4 page. Choose Save as PDF in the print dialog to download.')}</p>
        </section>
      </div>
      <details className="matching-picture-list"><summary>{l('그림 살펴보기 · 교체', 'Review · replace pictures')} <span>{assets.length}{l('종', ' pictures')}</span></summary><p className="matching-help">{l('그림을 누르면 묶음 안의 다른 그림으로 바꿀 수 있어요. 같은 그림은 모든 카드에서 함께 바뀝니다.', 'Select a picture to replace it throughout the deck with another picture from this pack.')}</p><div className="matching-asset-grid">{assets.map((asset, index) => <button type="button" key={asset.id} onClick={() => setReplaceIndex(index)} aria-pressed={replaceIndex === index}><img src={asset.src} alt="" width="44" height="44" loading="lazy"/><span>{en ? asset.en : asset.ko}</span></button>)}</div>{replaceIndex !== null && <div className="matching-replacements"><strong>{l(`${assets[replaceIndex].ko} 대신 사용할 그림`, `Replace ${assets[replaceIndex].en} with`)}</strong><div className="matching-asset-grid">{pack.assets.filter(asset => !assets.some(current => current.id === asset.id)).map(asset => <button key={asset.id} type="button" onClick={() => {const artwork = assets.map(current => current.id); artwork[replaceIndex] = asset.id; update({artwork});}}><img src={asset.src} alt="" width="44" height="44"/><span>{en ? asset.en : asset.ko}</span></button>)}</div><button type="button" className="button" onClick={() => setReplaceIndex(null)}>{l('닫기', 'Close')}</button></div>}</details>
      <section className="matching-ai"><div><h3><Sparkles size={18}/>{l('수업으로 연결하기', 'Connect it to your lesson')}</h3><p>{l('AI가 선택한 그림과 놀이 규칙을 바탕으로 수업 활동 초안을 도와줘요.', 'AI helps draft a lesson using your pictures and the game rules.')}</p></div><div className="matching-ai-fields"><label>{l('수업 주제', 'Lesson topic')}<input maxLength={160} value={topic} onChange={event => setTopic(event.target.value)} placeholder={l('예: 동물의 생김새를 관찰해요', 'e.g. Observe how animals look')}/></label><label>{l('학년', 'Grade')}<input maxLength={40} value={grade} onChange={event => setGrade(event.target.value)} placeholder={l('예: 초등 2학년', 'e.g. Grade 2')}/></label><button type="button" className="button primary" disabled={pending || !topic.trim()} onClick={askAi}><Sparkles size={16}/>{pending ? l('초안 만드는 중…', 'Drafting…') : l('AI 활동 초안', 'AI lesson draft')}</button></div>{aiResult && <><label htmlFor="matching-ai-result">{l('교사가 검토하고 수정하는 초안', 'Draft for teacher review')}</label>{aiKey !== currentAiKey && <p className="matching-help">{l('설정이 바뀌었어요. 이 초안은 이전 설정을 기준으로 만들었어요.', 'Settings have changed. This draft uses the previous settings.')}</p>}<textarea id="matching-ai-result" value={aiResult} maxLength={20000} onChange={event => setAiResult(event.target.value)} rows={10}/></>}</section>
      <button type="button" className="matching-show-all" onClick={() => setAllCards(!allCards)} aria-expanded={allCards}><ChevronDown size={17}/>{allCards ? l('전체 카드 접기', 'Hide all cards') : l(`카드 ${settings.printCount}장 모두 보기`, `View all ${settings.printCount} cards`)}</button>
      {allCards && <div className="matching-all-cards">{cards.map((card, index) => <figure key={index}><PictureCard card={card} assets={assets} shape={settings.shape} labels={settings.labels} locale={locale}/><figcaption>{index + 1}</figcaption></figure>)}</div>}
    </> : <section className="matching-play"><h3>{l('같은 그림을 찾아 눌러 보세요!', 'Find and click the matching picture!')}</h3><p>{l('두 카드 중 어느 쪽을 눌러도 좋아요.', 'You can select the picture on either card.')}</p><div className="matching-play-pair">{pair.map((card, index) => <PictureCard key={index} card={card} assets={assets} shape={settings.shape} labels={settings.labels} locale={locale} onPick={chooseImage} revealed={found}/>)}</div><p className="matching-answer" aria-live="polite">{answer || l('같은 그림은 딱 하나예요.', 'There is exactly one match.')}</p><div className="matching-actions"><button type="button" className="button" onClick={() => chooseImage(pair[0].find(id => pair[1].includes(id))!)}><Eye size={17}/>{l('정답 보기', 'Show answer')}</button><button type="button" className="button primary" onClick={() => {setRound(round + 1); setFound(undefined); setAnswer('');}}><RefreshCw size={17}/>{l('다음 카드', 'Next cards')}</button></div></section>}
    {error && <p className="matching-error" role="alert">{error}</p>}<p className="matching-notice" role="status" aria-live="polite">{notice}</p>
    <details className="matching-credits"><summary>{l('그림 출처 · 이미지 생성 안내', 'Artwork credits · Image generation')}</summary><p>Noto Emoji · Apache-2.0 / flag-icons · MIT. <a href="/tools/matching/NOTICE.txt" target="_blank" rel="noreferrer">{l('라이선스·출처 보기', 'View licenses and sources')}</a></p><p>{l('기본 그림은 별도 이미지 결제 없이 사용할 수 있어요. 실사 이미지의 유료 생성은 아직 제공하지 않으며, 이 화면에서는 이미지 결제가 발생하지 않아요.', 'Included pictures require no image purchase. Paid photorealistic image generation is not available yet; this screen does not charge for images.')}</p></details>
  </div>;
}
