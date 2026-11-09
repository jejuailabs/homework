'use client';

// Temporary, unlinked page for judging ten PNG sample pictures on a real phone.
// Saves nothing and does not change any teacher or student card screen.
import {useState} from 'react';
import {CardIllustration, CardIllustrationSampleContext} from '@/components/card-illustration';
import {CardsPracticePreview} from '@/components/cards-study';
import {illustrationHeadword, type cardIllustration} from '@/lib/card-illustrations';
import type {CardEntry} from '@/lib/cards-types';
import storage from '@/data/card-illustration-storage.json';

const SAMPLES: Record<string, {meaning: string; sense: string}> = {
  above: {meaning: '~위에', sense: '~위에'},
  absorb: {meaning: '흡수하다, 열중하게 하다', sense: '흡수하다'},
  accident: {meaning: '사고, 우연', sense: '사고'},
  adventure: {meaning: '모험', sense: '모험'},
  afraid: {meaning: '무서워하는, 두려운', sense: '두려운'},
  agree: {meaning: '동의하다', sense: '동의하다'},
  airplane: {meaning: '비행기', sense: '비행기'},
  ambulance: {meaning: '구급차', sense: '구급차'},
  analyze: {meaning: '분석하다', sense: '분석하다'},
  angel: {meaning: '천사', sense: '천사'},
};
const cards: CardEntry[] = Object.entries(SAMPLES).map(([word, value]) => ({id: word, front: word, back: value.meaning, example: '', alternatives: []}));

const sampleIllustration: typeof cardIllustration = (card, type = 'word') => {
  if (type !== 'word' || card.drill) return null;
  const word = illustrationHeadword(card.front);
  if (!word || !Object.hasOwn(SAMPLES, word)) return null;
  const object = encodeURIComponent(`cards/vocabulary/sample-png-v1/${word}.webp`);
  return {...SAMPLES[word], word, file: `${word}.webp`, review: 'ready', src: `https://firebasestorage.googleapis.com/v0/b/${storage.bucket}/o/${object}?alt=media&token=${storage.downloadToken}`};
};

const views = [['gallery', '모아보기'], ['memorize', '암기'], ['recall', '리콜'], ['spell', '스펠']] as const;
type View = (typeof views)[number][0];

export default function CardsSample() {
  const [view, setView] = useState<View>('gallery');
  return <CardIllustrationSampleContext.Provider value={sampleIllustration}>
    <div style={{padding: 16, maxWidth: 1100, margin: '0 auto'}}>
      <h1 style={{fontSize: 22, margin: '0 0 12px'}}>그림 카드 시험 (10장)</h1>
      <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14}}>
        {views.map(([name, label]) => <button key={name} type="button" className={`button${view === name ? ' primary' : ''}`} onClick={() => setView(name)}>{label}</button>)}
      </div>
      {view === 'gallery' ? <div className="cg-page">
        <h2 style={{fontSize: 17}}>게임 카드 크기</h2>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))', gap: 8, margin: '10px 0 22px'}}>
          {cards.map(card => <button key={card.id} className="cg-tile is-front" type="button" style={{minHeight: 100}}><span className="cg-pair-content"><CardIllustration card={card} variant="tile"/><span className="cg-pair-word">{card.front}</span></span></button>)}
        </div>
        <h2 style={{fontSize: 17}}>학습 카드 크기</h2>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginTop: 10}}>
          {cards.map(card => <div key={card.id} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 8, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)'}}>
            <CardIllustration card={card} variant="hero"/>
            <b>{card.front}</b><div style={{fontSize: 12, color: 'var(--muted)'}}>{card.back}</div>
          </div>)}
        </div>
      </div> : <CardsPracticePreview key={view} title="그림 카드 10장" cards={cards} mode={view}/>}
    </div>
  </CardIllustrationSampleContext.Provider>;
}
