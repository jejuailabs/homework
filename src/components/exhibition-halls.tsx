'use client';
import {useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode} from 'react';
import {useTranslations} from 'next-intl';
import {ArrowLeft, ChevronLeft, ChevronRight, Eye, LoaderCircle, Rocket, Sparkles, Star, Home, Users, Fish} from 'lucide-react';
import {CLASSIC_STICKER, hallName, hallOf, summarizeHalls, type HallKind} from '@/lib/exhibition-halls';
import {isSpaceTheme, spaceThemePreview} from '@/lib/space-exhibition/themes';
import {isOceanTheme, oceanThemePreview} from '@/lib/ocean-exhibition/themes';
import type {Exhibition} from '@/lib/exhibition-types';
import {exhibitionDateLabel} from '@/lib/exhibition-date';

type DialogProps = {title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean};
export type HallRoom = Pick<Exhibition, 'id' | 'title' | 'className' | 'classId' | 'status' | 'theme' | 'approvedCount' | 'createdAt'>;

/** Room picture: the space rooms show their exterior, classic rooms a sticker on their colour. */
export function RoomThumb({theme}: {theme?: Exhibition['theme']}) {
  if (isSpaceTheme(theme)) return <span className="ex-room-thumb is-space"><img src={spaceThemePreview(theme)} alt="" loading="lazy"/></span>;
  if (isOceanTheme(theme)) return <span className="ex-room-thumb is-space is-ocean"><img src={oceanThemePreview(theme)} alt="" loading="lazy"/></span>;
  return <span className={`ex-room-thumb ex-thumb-${theme || 'cozy'}`}><img src={CLASSIC_STICKER[theme || 'cozy'] || CLASSIC_STICKER.cozy} alt="" loading="lazy"/></span>;
}
export function HallThumb({kind}: {kind: HallKind}) {
  if (kind === 'space') return <span className="ex-hall-thumb is-space"><img src={spaceThemePreview('saturn')} alt="" loading="lazy"/></span>;
  if (kind === 'ocean') return <span className="ex-hall-thumb is-space is-ocean"><img src={oceanThemePreview('coral')} alt="" loading="lazy"/></span>;
  return <span className="ex-hall-thumb is-classic"><img src={CLASSIC_STICKER.sky} alt="" loading="lazy"/><img src={CLASSIC_STICKER.cozy} alt="" loading="lazy"/></span>;
}
const HallIcon = ({kind, size = 15}: {kind: HallKind; size?: number}) => kind === 'space' ? <Rocket size={size}/> : kind === 'ocean' ? <Fish size={size}/> : <Home size={size}/>;

/** Teacher home: one card per 전시관 with its room count; the newest room's hall carries LATEST. */
export function TeacherHallList({halls, selected, latest, locale, onSelect, onPreview}: {halls: {kind: HallKind; count: number}[]; selected: HallKind | null; latest: HallKind | null; locale: string; onSelect: (kind: HallKind) => void; onPreview: (kind: HallKind) => void}) {
  const t = useTranslations('exhibition');
  return <div className="ex-hall-list">{halls.map(hall => <div key={hall.kind} className="ex-hall-card" aria-current={selected === hall.kind ? 'true' : undefined}>
    <button type="button" className="ex-hall-main" onClick={() => onSelect(hall.kind)}>
      <span className="ex-hall-cover"><HallThumb kind={hall.kind}/>{latest === hall.kind && <em className="ex-latest"><Sparkles size={11}/>LATEST</em>}{selected === hall.kind && <em className="ex-hall-picked">{t('halls.picked')}</em>}</span>
      <span className="ex-hall-copy"><strong><HallIcon kind={hall.kind} size={17}/>{hallName(hall.kind, locale)}</strong><small>{t('halls.roomCount', {count: hall.count})}</small></span>
    </button>
    <button type="button" className="ex-text-button ex-hall-preview" onClick={() => onPreview(hall.kind)}><Eye size={14}/>{t('halls.preview')}</button>
  </div>)}</div>;
}

/** Text list of every room in one hall; picking one opens it. */
export function HallPreview({kind, locale, DialogComponent, onClose, onOpen}: {kind: HallKind; locale: string; DialogComponent: ComponentType<DialogProps>; onClose: () => void; onOpen: (id: string) => void}) {
  const t = useTranslations('exhibition');
  const [rooms, setRooms] = useState<HallRoom[] | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    fetch(`/api/exhibitions/halls/${kind}`, {cache: 'no-store'}).then(async response => {const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || t('error')); if (alive) setRooms(data.rooms || []);}).catch(reason => {if (alive) setError((reason as Error).message);});
    return () => {alive = false;};
    // The translator can change identity on preference hydration; it must not restart the read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  return <DialogComponent title={t('halls.previewTitle', {hall: hallName(kind, locale)})} onClose={onClose}>
    {error ? <p className="ex-form-error ex-hall-sheet" role="alert">{error}</p> : !rooms ? <p role="status" className="ex-hall-loading ex-hall-sheet"><LoaderCircle className="spin" size={18}/>{t('loadingRooms')}</p> : !rooms.length ? <p className="ex-form-hint ex-hall-sheet">{t('halls.emptyHall')}</p> :
      <div className="ex-hall-sheet">
        <div className="ex-hall-sheet-head"><HallThumb kind={kind}/><span className="ex-hall-copy"><strong><HallIcon kind={kind}/>{hallName(kind, locale)}</strong><small>{t('halls.roomCount', {count: rooms.length})} · {t('halls.newestFirst')}</small></span></div>
        <ol className="ex-hall-rooms">{rooms.map(room => <li key={room.id}><button type="button" onClick={() => onOpen(room.id)}>
          <span className="ex-hall-room-thumb"><RoomThumb theme={room.theme}/></span>
          <span className="ex-hall-room-text"><span className="ex-hall-room-title" title={room.title}>{room.title}</span><span className="ex-hall-room-meta"><Users size={11}/>{room.className}{exhibitionDateLabel(room.createdAt, locale) && <> · {exhibitionDateLabel(room.createdAt, locale)}</>}</span></span>
          <span className={`ex-status ex-status-${room.status}`}>{t(room.status)}</span><ChevronRight className="ex-hall-room-go" size={16}/>
        </button></li>)}</ol>
      </div>}
  </DialogComponent>;
}

function RoomCard({room, locale, isNew, mine, onOpen}: {room: Exhibition; locale: string; isNew: boolean; mine: boolean; onOpen: (id: string) => void}) {
  const t = useTranslations('exhibition');
  return <button type="button" className="ex-entry-card" onClick={() => onOpen(room.id)}>
    <span className="ex-entry-thumb"><RoomThumb theme={room.theme}/>{isNew && <em className="ex-new">NEW</em>}{mine && <em className="ex-mine"><Star size={11}/>{t('entry.mine')}</em>}</span>
    <span className="ex-entry-title" title={room.title}>{room.title}</span>
    <span className="ex-entry-meta"><HallIcon kind={hallOf(room.theme)} size={12}/>{hallName(hallOf(room.theme), locale)}</span>
  </button>;
}

/**
 * Children's entry (also the teacher's preview): newest open rooms on top, 3 across on wide screens and 2 on phones,
 * then the 전시관 shelf where a child can walk in hall by hall.
 */
export function ExhibitionEntry({rooms, visited, mine, locale, onOpen}: {rooms: Exhibition[]; visited: string[]; mine: string[]; locale: string; onOpen: (id: string) => void}) {
  const t = useTranslations('exhibition');
  const [hall, setHall] = useState<HallKind | null>(null);
  const seen = useMemo(() => new Set(visited), [visited]), own = useMemo(() => new Set(mine), [mine]);
  const shown = useMemo(() => rooms.filter(room => room.status !== 'draft').sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [rooms]);
  const halls = useMemo(() => summarizeHalls(shown), [shown]);
  const recent = shown.slice(0, 6), strip = useRef<HTMLDivElement>(null);
  const page = (direction: number) => {const row = strip.current; if (row) row.scrollBy({left: direction * row.clientWidth, behavior: 'smooth'});};
  const fresh = (rooms: Exhibition[]) => rooms.some(room => !seen.has(room.id));
  if (!shown.length) return <section className="ex-entry"><div className="ex-entry-empty"><img src="/characters/otter-moa.webp" alt=""/><p>{t('emptyStudent')}</p></div></section>;
  const open = hall ? halls.find(item => item.kind === hall) : null;
  if (open) return <section className="ex-entry">
    <div className="ex-entry-head"><button type="button" className="ex-button" onClick={() => setHall(null)}><ArrowLeft size={16}/>{t('entry.back')}</button><h2><HallIcon kind={open.kind} size={18}/>{hallName(open.kind, locale)}</h2><span className="ex-entry-count">{t('halls.roomCount', {count: open.count})}</span></div>
    <div className="ex-entry-grid">{open.rooms.map(room => <RoomCard key={room.id} room={room} locale={locale} isNew={!seen.has(room.id)} mine={own.has(room.id)} onOpen={onOpen}/>)}</div>
  </section>;
  return <section className="ex-entry">
    <div className="ex-entry-head"><h2>{t('entry.recent')}</h2>{recent.length > 2 && <span className="ex-entry-arrows"><button type="button" className="ex-icon-btn" aria-label={t('entry.prev')} onClick={() => page(-1)}><ChevronLeft size={18}/></button><button type="button" className="ex-icon-btn" aria-label={t('entry.next')} onClick={() => page(1)}><ChevronRight size={18}/></button></span>}</div>
    <div className="ex-entry-strip" ref={strip}>{recent.map(room => <RoomCard key={room.id} room={room} locale={locale} isNew={!seen.has(room.id)} mine={own.has(room.id)} onOpen={onOpen}/>)}</div>
    <div className="ex-entry-head ex-entry-halls-head"><h2>{t('entry.halls')}</h2></div>
    <div className="ex-entry-halls">{halls.map(item => <button type="button" key={item.kind} className="ex-entry-hall" onClick={() => setHall(item.kind)}>
      <HallThumb kind={item.kind}/><span className="ex-hall-copy"><strong><HallIcon kind={item.kind}/>{hallName(item.kind, locale)}{fresh(item.rooms) && <em className="ex-new">NEW</em>}</strong><small>{t('halls.roomCount', {count: item.count})}</small></span><ChevronRight size={18}/>
    </button>)}</div>
  </section>;
}

