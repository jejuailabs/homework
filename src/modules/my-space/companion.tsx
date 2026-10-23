'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import CharacterAvatar from '@/components/character-avatar';
import { spaceItem } from './catalog';
import { friendBase, petPersonality } from './personality';
import './styles.css';
/** One background read per student shell, refreshed only after a real customization. */
export default function StudentCompanion() { const path = usePathname(), [state, setState] = useState<{
    pet: string;
    name: string;
    outfit: any;
    wardrobe: any;
} | null>(null), [open, setOpen] = useState(false), [line, setLine] = useState(0); useEffect(() => { let live = true; async function load() { try {
    const r = await fetch('/api/my-space', { cache: 'no-store' });
    if (!r.ok)
        return;
    const data = await r.json(), pet = spaceItem(data.room.pet);
    if (live)
        setState({ pet: data.room.pet, name: data.room.nicknames?.[data.room.pet] || pet?.buddyName || pet?.name, outfit: data.room.outfit, wardrobe: data.profile.wardrobe });
}
catch { } } void load(); const clear = () => { setState(null); setOpen(false); }; window.addEventListener('my-space-changed', load); window.addEventListener('homework-session-ended', clear); return () => { live = false; window.removeEventListener('my-space-changed', load); window.removeEventListener('homework-session-ended', clear); }; }, []); useEffect(() => { setOpen(false); }, [path]); if (!state || path === '/student' || path === '/student/my-exhibition' || path.includes('/exhibitions') || path.includes('/canvases') || path.includes('/cards/') || path.includes('/my-space'))
    return null; const item = spaceItem(state.pet), p = petPersonality(state.pet); return <aside className="ms-companion" aria-label="함께하는 동물 친구">{open && <div className="ms-companion-popover"><button type="button" onClick={() => setOpen(false)} aria-label="친구 이야기 닫기">×</button><strong>{state.name}</strong><p aria-live="polite">{p.hello[line % p.hello.length]}</p><Link href="/student/my-space">우리 방에 놀러 가기 →</Link></div>}<button type="button" aria-label={`${state.name}의 이야기`} aria-expanded={open} onClick={() => { if (open)
    setLine(n => n + 1); setOpen(true); }}><CharacterAvatar character={friendBase(state.pet)} imageSrc={item?.art} spaceOutfit={state.outfit} outfit={state.wardrobe}/></button></aside>; }
