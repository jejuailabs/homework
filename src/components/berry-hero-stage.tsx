'use client';
import {useEffect, useRef, useState, type CSSProperties} from 'react';
import {berryAssetUrl} from '@/lib/berry-brand';

const BERRIES = ['blue-hallabong', 'rasp-haenyeo', 'blue-horse', 'rasp-hareubang', 'blue-haenyeo', 'rasp-hallabong', 'blue-hareubang', 'rasp-horse'];
const ORBIT_MS = 30000;
const SWAP_MS = 7000;

/** One big hero berry; the other seven orbit. Every few seconds the berry passing
 *  behind the hero swaps places with it, so the change happens out of sight. */
export function BerryHeroStage(){
  const [{hero, slots}, setCast] = useState({hero: BERRIES[0], slots: BERRIES.slice(1)});
  const orbitRefs = useRef<(HTMLImageElement | null)[]>([]);

  useEffect(() => {
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      // pick the orbiter closest to the back of the ellipse (phase 0.5)
      let best = 0, bestGap = 1;
      orbitRefs.current.forEach((el, i) => {
        const anim = el?.getAnimations().find(a => (a as CSSAnimation).animationName === 'berry-orbit');
        const time = Number(anim?.currentTime ?? 0) + i * ORBIT_MS / 7;
        const phase = (time % ORBIT_MS) / ORBIT_MS;
        const gap = Math.abs(phase - 0.5);
        if(gap < bestGap){ best = i; bestGap = gap; }
      });
      setCast(prev => {
        const slots = [...prev.slots];
        slots[best] = prev.hero;
        return {hero: prev.slots[best], slots};
      });
    }, SWAP_MS);
    return () => window.clearInterval(timer);
  }, []);

  return <>
    <img key={hero} className="berry-hero" src={berryAssetUrl(hero)} alt=""/>
    {slots.map((name, i) => <img key={i} ref={el => { orbitRefs.current[i] = el; }} className="berry-orbiter" style={{'--i': i} as CSSProperties} src={berryAssetUrl(name)} alt=""/>)}
  </>;
}
