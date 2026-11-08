'use client';

import {useState, useSyncExternalStore} from 'react';
import {Image as ImageIcon} from 'lucide-react';
import {usePreferences} from './providers';
import {CARD_ILLUSTRATIONS_LIVE, cardIllustration, type IllustratedCard} from '@/lib/card-illustrations';
import type {CardSetType} from '@/lib/cards-types';

const STORAGE_KEY = 'cards-illustrations-v1';
const listeners = new Set<() => void>();
let enabled = true, initialized = false;
function readPreference() {
  if (typeof window === 'undefined') return;
  try {enabled = window.localStorage.getItem(STORAGE_KEY) !== 'off';} catch { /* Memory preference still works in private/restricted storage. */ }
  initialized = true;
}
function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  readPreference();
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  if (listeners.size === 0) {readPreference(); window.addEventListener('storage', onStorage);}
  listeners.add(listener);
  return () => {listeners.delete(listener); if (listeners.size === 0) window.removeEventListener('storage', onStorage);};
}
function snapshot() {if (!initialized) readPreference(); return enabled;}
const serverSnapshot = () => true;
function setEnabled(value: boolean) {
  enabled = value;
  initialized = true;
  try {window.localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');} catch { /* The switch does not depend on browser storage. */ }
  listeners.forEach(listener => listener());
}

export function useCardIllustrations() {return useSyncExternalStore(subscribe, snapshot, serverSnapshot);}

/** One shared, device-local switch; reverting to the familiar text layout takes one tap. */
export function CardIllustrationToggle({className = ''}: {className?: string}) {
  const checked = useCardIllustrations(), {locale} = usePreferences();
  if (!CARD_ILLUSTRATIONS_LIVE) return null;
  return <label className={`ci-toggle ${className}`}><input type="checkbox" checked={checked} onChange={event => setEnabled(event.target.checked)}/><ImageIcon size={16} aria-hidden="true"/><span>{locale === 'ko' ? '그림 보기' : 'Show pictures'}</span></label>;
}

type Props = {
  card: IllustratedCard;
  type?: CardSetType;
  variant?: 'hero' | 'thumb' | 'tile' | 'compact';
  className?: string;
  enabled?: boolean;
  /** Off by default: captions must never reveal a hidden answer. */
  showCaption?: boolean;
};

/** Decorative support for text. Parents decide when an answer/hint may be shown. */
export function CardIllustration({card, type = 'word', variant = 'hero', className = '', enabled: allowed = true, showCaption = false}: Props) {
  const visible = useCardIllustrations();
  if (!visible || !allowed) return null;
  const artwork = cardIllustration(card, type);
  if (!artwork?.src) return null;
  return <LoadedIllustration key={artwork.src} src={artwork.src} sense={artwork.sense} variant={variant} className={className} showCaption={showCaption}/>;
}

function LoadedIllustration({src, sense, variant, className, showCaption}: {src: string; sense: string; variant: NonNullable<Props['variant']>; className: string; showCaption: boolean}) {
  const [failed, setFailed] = useState(false);
  const {locale} = usePreferences();
  if (failed) return null;
  return <span className={`ci-art ci-art--${variant} ${className}`}>
    <img src={src} alt="" aria-hidden="true" width={512} height={512} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)}/>
    {showCaption && <span className="ci-caption">{locale === 'ko' ? '그림 속 뜻' : 'Illustrated meaning'} · {sense}</span>}
  </span>;
}
