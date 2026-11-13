'use client';
import {useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode} from 'react';
import {useTranslations} from 'next-intl';
import {ArrowLeft, ChevronLeft, ChevronRight, Eye, LoaderCircle, Rocket, Sparkles, Star, Home, Users, Fish, DoorOpen} from 'lucide-react';
import {CLASSIC_STICKER, hallFamily, hallName, hallOf, summarizeHalls, type HallKind} from '@/lib/exhibition-halls';
import {isSpaceTheme, spaceThemePreview} from '@/lib/space-exhibition/themes';
import {isOceanTheme, oceanThemePreview} from '@/lib/ocean-exhibition/themes';
import type {Exhibition} from '@/lib/exhibition-types';
import {exhibitionDateLabel} from '@/lib/exhibition-date';

type DialogProps = {title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean};
export type HallRoom = Pick<Exhibition, 'id' | 'title' | 'className' | 'classId' | 'status' | 'theme' | 'approvedCount' | 'createdAt'>;

/** First approved artwork per room, fetched once per page for the cards on screen. */
const coverCache = new Map<string, string | null>();
export function useRoomCovers(ids: string[]) {
  const key = ids.join(',');
  const [covers, setCovers] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const list = key ? key.split(',') : [], need = list.filter(roomId => !coverCache.has(roomId)).slice(0, 40);
    const apply = () => setCovers(Object.fromEntries(list.map(roomId => [roomId, coverCache.get(roomId) ?? null])));
    if (!need.length) {apply(); return;}
    let alive = true;
    fetch(`/api/exhibitions/covers?ids=${need.join(',')}`, {cache: 'no-store'}).then(response => response.ok ? response.json() : {covers: {}}).then(data => {need.forEach(roomId => coverCache.set(roomId, data.covers?.[roomId] ?? null)); if (alive) apply();}).catch(() => undefined);
    return () => {alive = false;};
  }, [key]);
  return covers;
}

/** Room picture: its first artwork when there is one; otherwise the space/ocean exterior or a classic sticker. */
export function RoomThumb({theme, cover}: {theme?: Exhibition['theme']; cover?: string | null}) {
  if (cover) return <span className="ex-room-thumb is-cover"><img src={cover} alt="" loading="lazy"/></span>;
  if (isSpaceTheme(theme)) return <span className="ex-room-thumb is-space"><img src={spaceThemePreview(theme)} alt="" loading="lazy"/></span>;
  if (isOceanTheme(theme)) return <span className="ex-room-thumb is-space is-ocean"><img src={oceanThemePreview(theme)} alt="" loading="lazy"/></span>;
  return <span className={`ex-room-thumb ex-thumb-${theme || 'cozy'}`}><img src={CLASSIC_STICKER[theme || 'cozy'] || CLASSIC_STICKER.cozy} alt="" loading="lazy"/></span>;
}
/** A hall's picture is its theme's own picture. */
export function HallThumb({kind}: {kind: HallKind}) {
  if (isSpaceTheme(kind)) return <span className="ex-hall-thumb is-space"><img src={spaceThemePreview(kind)} alt="" loading="lazy"/></span>;
  if (isOceanTheme(kind)) return <span className="ex-hall-thumb is-space is-ocean"><img src={oceanThemePreview(kind)} alt="" loading="lazy"/></span>;
  return <span className={`ex-hall-thumb is-classic ex-thumb-${kind}`}><img src={CLASSIC_STICKER[kind] || CLASSIC_STICKER.cozy} alt="" loading="lazy"/></span>;
}
const HallIcon = ({kind, size = 15}: {kind: HallKind; size?: number}) => hallFamily(kind) === 'space' ? <Rocket size={size}/> : hallFamily(kind) === 'ocean' ? <Fish size={size}/> : <Home size={size}/>;

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

function RoomCard({room, locale, isNew, mine, cover, onOpen}: {room: Exhibition; locale: string; isNew: boolean; mine: boolean; cover?: string | null; onOpen: (id: string) => void}) {
  const t = useTranslations('exhibition');
  return <button type="button" className="ex-entry-card" onClick={() => onOpen(room.id)}>
    <span className="ex-entry-thumb"><RoomThumb theme={room.theme} cover={cover}/>{isNew && <em className="ex-new">NEW</em>}{mine && <em className="ex-mine"><Star size={11}/>{t('entry.mine')}</em>}</span>
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
  // Newest hall first, so the hall with the latest room sits at the top of the shelf.
  const halls = useMemo(() => summarizeHalls(shown).sort((a, b) => b.latestAt.localeCompare(a.latestAt)), [shown]);
  const recent = shown.slice(0, 6), strip = useRef<HTMLDivElement>(null);
  const page = (direction: number) => {const row = strip.current; if (row) row.scrollBy({left: direction * row.clientWidth, behavior: 'smooth'});};
  const fresh = (rooms: Exhibition[]) => rooms.some(room => !seen.has(room.id));
  const opened = hall ? halls.find(item => item.kind === hall) : null;
  const covers = useRoomCovers([...new Set([...recent, ...(opened?.rooms || [])].map(room => room.id))]);
  if (!shown.length) return <section className="ex-entry"><div className="ex-entry-empty"><img src="/characters/otter-moa.webp" alt=""/><p>{t('emptyStudent')}</p></div></section>;
  const open = hall ? halls.find(item => item.kind === hall) : null;
  if (open) return <section className="ex-entry">
    <div className="ex-entry-head"><button type="button" className="ex-button" onClick={() => setHall(null)}><ArrowLeft size={16}/>{t('entry.back')}</button><h2><HallIcon kind={open.kind} size={18}/>{hallName(open.kind, locale)}</h2><span className="ex-entry-count">{t('halls.roomCount', {count: open.count})}</span></div>
    {/* Space and ocean halls show their own scenery with a door per room, like the teacher's view. */}
    {hallFamily(open.kind) !== 'classic' ? <ThemedHallLobby kind={open.kind} rooms={open.rooms} locale={locale} onOpen={onOpen}/> : <div className="ex-entry-grid">{open.rooms.map(room => <RoomCard key={room.id} room={room} locale={locale} isNew={!seen.has(room.id)} mine={own.has(room.id)} cover={covers[room.id]} onOpen={onOpen}/>)}</div>}
  </section>;
  return <section className="ex-entry">
    <div className="ex-entry-head"><h2>{t('entry.recent')}</h2>{recent.length > 2 && <span className="ex-entry-arrows"><button type="button" className="ex-icon-btn" aria-label={t('entry.prev')} onClick={() => page(-1)}><ChevronLeft size={18}/></button><button type="button" className="ex-icon-btn" aria-label={t('entry.next')} onClick={() => page(1)}><ChevronRight size={18}/></button></span>}</div>
    <div className="ex-entry-strip" ref={strip}>{recent.map(room => <RoomCard key={room.id} room={room} locale={locale} isNew={!seen.has(room.id)} mine={own.has(room.id)} cover={covers[room.id]} onOpen={onOpen}/>)}</div>
    <div className="ex-entry-head ex-entry-halls-head"><h2>{t('entry.halls')}</h2></div>
    <div className="ex-entry-halls">{halls.map(item => <button type="button" key={item.kind} className="ex-entry-hall" onClick={() => setHall(item.kind)}>
      <HallThumb kind={item.kind}/><span className="ex-hall-copy"><strong><HallIcon kind={item.kind}/>{hallName(item.kind, locale)}{fresh(item.rooms) && <em className="ex-new">NEW</em>}</strong><small>{t('halls.roomCount', {count: item.count})}</small></span><ChevronRight size={18}/>
    </button>)}</div>
  </section>;
}


/** Twinkling points for the space hall picture: left %, top %, delay s, duration s, size px (fixed so server and browser agree). */
const SKY_STARS: [number, number, number, number, number][] = Array.from({length: 36}, (_, i) => [(i * 37 + 11) % 97, (i * 23 + 7) % 48, (i * 0.37) % 3.2, 1.8 + (i * 0.53) % 2.6, i % 7 === 0 ? 4 : i % 3 === 0 ? 3 : 2]);
/**
 * Space and ocean halls have no shared 3D building: their 3D worlds are one room each (exterior → door → gallery).
 * So walking into those halls shows the hall's own scenery with a door per room; a door opens that room's 3D world.
 */
export function ThemedHallLobby({kind, rooms, locale, onOpen}: {kind: HallKind; rooms: Exhibition[]; locale: string; onOpen: (id: string) => void}) {
  const t = useTranslations('exhibition');
  const backdrop = isOceanTheme(kind) ? oceanThemePreview(kind) : isSpaceTheme(kind) ? spaceThemePreview(kind) : '';
  const covers = useRoomCovers(rooms.map(room => room.id));
  return <div className={`ex-hall-lobby is-${hallFamily(kind)}`}>
    <img className="ex-hall-lobby-bg" src={backdrop} alt=""/>
    {hallFamily(kind) === 'space' && <span className="ex-sky-fx" aria-hidden="true">{SKY_STARS.map((star, index) => <i key={index} style={{left: `${star[0]}%`, top: `${star[1]}%`, animationDelay: `${star[2]}s`, animationDuration: `${star[3]}s`, width: star[4], height: star[4]}}/>)}<b/><b/></span>}
    <div className="ex-hall-lobby-inner">
      <p className="ex-hall-lobby-sign"><HallIcon kind={kind} size={16}/>{hallName(kind, locale)} · {t('halls.lobbyHint')}</p>
      <div className="ex-hall-lobby-doors">{rooms.map(room => <button type="button" key={room.id} className="ex-hall-door" onClick={() => onOpen(room.id)}>
        <RoomThumb theme={room.theme} cover={covers[room.id]}/>
        <span className="ex-hall-door-copy"><strong title={room.title}>{room.title}</strong><small>{room.className} · {t(room.status)}</small></span>
        <span className="ex-hall-door-go"><DoorOpen size={15}/>{t('halls.enterRoom')}</span>
      </button>)}</div>
    </div>
  </div>;
}
