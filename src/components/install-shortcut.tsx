'use client';

import {useEffect, useRef, useState} from 'react';
import {useTranslations} from 'next-intl';
import {Download, Monitor, Share, Smartphone, X} from 'lucide-react';
import '@/styles/install-shortcut.css';

type InstallEvent = Event & {prompt: () => Promise<void>; userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>};

export default function InstallShortcut() {
  const t = useTranslations('common');
  const dialog = useRef<HTMLDialogElement>(null);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false), [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)');
    const sync = () => setInstalled(standalone.matches || !!(navigator as Navigator & {standalone?: boolean}).standalone);
    const ua = navigator.userAgent;
    setInApp(/KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(ua));
    setPlatform(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop');
    const available = (event: Event) => {event.preventDefault(); setPrompt(event as InstallEvent);};
    const complete = () => {dialog.current?.close(); setPrompt(null); setInstalled(true);};
    sync(); standalone.addEventListener('change', sync);
    window.addEventListener('beforeinstallprompt', available); window.addEventListener('appinstalled', complete);
    return () => {standalone.removeEventListener('change', sync); window.removeEventListener('beforeinstallprompt', available); window.removeEventListener('appinstalled', complete);};
  }, []);
  async function install() {
    if (!prompt || busy) return;
    setBusy(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') {dialog.current?.close(); setInstalled(true);}
    } catch {/* Manual instructions remain available if the browser declines. */}
    finally {setPrompt(null); setBusy(false);}
  }
  function download() {
    const blob = new Blob([`[InternetShortcut]\r\nURL=${location.origin}/\r\n`], {type: 'application/internet-shortcut'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'homework-friends.url'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (installed) return null;
  return <>
    <button type="button" className="install-shortcut-link" onClick={() => dialog.current?.showModal()}><Download size={15}/>{t('installShortcut')}</button>
    <dialog ref={dialog} className="install-shortcut-dialog" aria-labelledby="install-shortcut-title">
      <div className="section-heading"><h2 id="install-shortcut-title">{t('installTitle')}</h2><button type="button" className="icon-button" aria-label={t('close')} onClick={() => dialog.current?.close()}><X size={20}/></button></div>
      <div className="install-shortcut-intro"><img src="/icons/app-192.png" alt="" width="64" height="64"/><p>{t('installIntro')}</p></div>
      {inApp && <p className="install-shortcut-note" role="status">{t('installInApp')}</p>}
      {prompt && <button type="button" className="button primary wide" disabled={busy} onClick={() => void install()}><Download size={17}/>{t('installApp')}</button>}
      {!prompt && <p className="install-shortcut-note">{t('installManualHint')}</p>}
      <section className="install-shortcut-steps">
        {platform === 'ios' ? <><h3><Share size={18}/>{t('installIosTitle')}</h3><ol><li>{t('installIosOpen')}</li><li>{t('installIosShare')}</li><li>{t('installIosAdd')}</li></ol></> : platform === 'android' ? <><h3><Smartphone size={18}/>{t('installAndroidTitle')}</h3><ol><li>{t('installAndroidOpen')}</li><li>{t('installAndroidMenu')}</li><li>{t('installConfirm')}</li></ol></> : <><h3><Monitor size={18}/>{t('installDesktopTitle')}</h3><ol><li>{t('installDesktopOpen')}</li><li>{t('installDesktopMenu')}</li><li>{t('installConfirm')}</li></ol><button type="button" className="button soft" onClick={download}><Download size={16}/>{t('installWindowsDownload')}</button><p>{t('installWindowsHint')}</p></>}
      </section>
      <p className="install-shortcut-note">{t('installConnection')}</p>
    </dialog>
  </>;
}
