'use client';
import {useCallback, useEffect, useState} from 'react';
import {Copy, Link2, LoaderCircle, Printer, XCircle} from 'lucide-react';
import {useCardsFamilyCopy} from '@/lib/cards-family-copy';
import {cardsRequest, CardsDialog, CardsLoading} from './cards-shared';
import '@/styles/cards-family.css';

type Share = {id: string; studentId: string; state: 'active' | 'expired' | 'revoked'; expiresAt: string; createdAt: string; revokedAt: string | null; views: number};
type Made = {studentId: string; number: number; name: string; displayName: string; path: string; expiresAt: string};
type Pupil = {id: string; name: string; number: number; disabled: boolean};
const escape = (value: string) => value.replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[ch]!);
async function copyText(value: string) {
  try {await navigator.clipboard.writeText(value); return true;} catch {}
  const area = document.createElement('textarea'); area.value = value; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select();
  try {return document.execCommand('copy');} catch {return false;} finally {area.remove();}
}

/** 리포트의 [학부모 링크]: 학생별로 만들고 닫는다. 토큰은 만든 직후 이 창에만 보이고 서버는 해시만 가진다. */
export default function CardsParentLinks({distributionId, title, students, onClose}: {distributionId: string; title: string; students: Pupil[]; onClose: () => void}) {
  const {locale, copy: c, fill} = useCardsFamilyCopy();
  const [shares, setShares] = useState<Share[] | null>(null), [made, setMade] = useState<Made[]>([]), [days, setDays] = useState(14), [nameMode, setNameMode] = useState<'given' | 'full' | 'none'>('given'), [note, setNote] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const base = `/api/cards/distributions/${encodeURIComponent(distributionId)}/shares`, pupils = students.filter(row => !row.disabled);
  const load = useCallback(async () => {try {setShares((await cardsRequest<{shares: Share[]}>(base)).shares);} catch (cause) {setError((cause as Error).message);}}, [base]);
  useEffect(() => {void load();}, [load]);
  const date = (value: string) => new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric'}).format(new Date(value));
  const url = (path: string) => `${window.location.origin}${path}`;
  async function run(task: () => Promise<void>) {if (busy) return; setBusy(true); setError(''); setNotice(''); try {await task(); await load();} catch (cause) {setError((cause as Error).message);} finally {setBusy(false);}}
  const create = (studentIds: string[] | 'all') => run(async () => {
    const result = await cardsRequest<{links: Made[]}>(base, {method: 'POST', body: JSON.stringify({studentIds, days, nameMode, note})});
    setMade(previous => [...previous.filter(row => !result.links.some(link => link.studentId === row.studentId)), ...result.links].sort((a, b) => a.number - b.number)); setNotice(fill('created', {n: result.links.length}));
  });
  const revoke = (shareId?: string) => run(async () => {
    if (!shareId && !window.confirm(c.revokeAllConfirm)) return;
    const result = await cardsRequest<{revoked: number}>(shareId ? `${base}/${encodeURIComponent(shareId)}` : base, {method: 'DELETE'});
    setMade(previous => shareId ? previous.filter(row => row.studentId !== shares?.find(share => share.id === shareId)?.studentId) : []); setNotice(fill('revoked', {n: result.revoked}));
  });
  const list = () => made.map(row => `${row.number}. ${row.name}\t${url(row.path)}`).join('\n');
  function print() {
    const view = window.open('', '_blank', 'width=820,height=900'); if (!view) return;
    view.document.write(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${escape(c.printHeading)}</title><style>body{font:14px/1.6 system-ui,sans-serif;margin:32px;color:#222}h1{font-size:18px}p{color:#555}li{margin:10px 0;break-inside:avoid}code{display:block;font-size:12px;word-break:break-all}</style></head><body><h1>${escape(c.printHeading)} · ${escape(title)}</h1><p>${escape(fill('expires', {date: made[0] ? date(made[0].expiresAt) : ''}))}</p><ol>${made.map(row => `<li><strong>${row.number}. ${escape(row.name)}</strong><code>${escape(url(row.path))}</code></li>`).join('')}</ol></body></html>`);
    view.document.close(); view.focus(); view.print();
  }
  const latest = (studentId: string) => shares?.find(share => share.studentId === studentId);
  const stateText = (share?: Share) => !share ? c.stateNone : share.state === 'active' ? fill('stateActive', {date: date(share.expiresAt), views: share.views}) : share.state === 'expired' ? c.stateExpired : c.stateRevoked;
  return <CardsDialog title={`${c.linksTitle} · ${title}`} closeLabel={c.close} onClose={onClose}><div className="cpl">
    <p className="cards-muted">{c.linksIntro}</p><p className="cards-muted">{c.linksShows}</p>
    <fieldset className="cards-fieldset" disabled={busy}><div className="cards-form-grid">
      <label>{c.days}<input type="number" min={1} max={60} value={days} onChange={event => setDays(Math.min(60, Math.max(1, Math.round(Number(event.target.value) || 14))))}/><small className="cards-muted">{c.daysHint}</small></label>
      <label>{c.nameMode}<select value={nameMode} onChange={event => setNameMode(event.target.value as typeof nameMode)}><option value="given">{c.nameGiven}</option><option value="full">{c.nameFull}</option><option value="none">{c.nameNone}</option></select></label>
    </div><label className="cpl-note">{c.note}<textarea maxLength={300} rows={2} value={note} placeholder={c.notePlaceholder} onChange={event => setNote(event.target.value)}/></label></fieldset>
    <div className="cards-actions"><button type="button" className="button primary" disabled={busy || !pupils.length} onClick={() => void create('all')}>{busy ? <LoaderCircle size={16} className="spin"/> : <Link2 size={16}/>}{c.createAll}</button><button type="button" className="button" disabled={busy || !shares?.some(share => share.state === 'active')} onClick={() => void revoke()}><XCircle size={16}/>{c.revokeAll}</button></div>
    <p className="cards-muted">{c.replaceNote}</p>
    {notice && <p role="status" className="cards-notice">{notice}</p>}{error && <p role="alert" className="cards-error">{error}</p>}
    {!!made.length && <section className="cpl-made" aria-live="polite"><h3>{fill('created', {n: made.length})}</h3><p className="cards-muted">{c.createdHint}</p><div className="cards-actions"><button type="button" className="button" onClick={async () => setNotice(await copyText(list()) ? c.copied : c.copyFailed)}><Copy size={15}/>{c.copyAll}</button><button type="button" className="button" onClick={print}><Printer size={15}/>{c.printList}</button></div>
      <ol>{made.map(row => <li key={row.studentId}><span>{row.number}. {row.name}</span><input readOnly value={url(row.path)} onFocus={event => event.target.select()} aria-label={`${row.number}. ${row.name}`}/><button type="button" className="button" onClick={async () => setNotice(await copyText(url(row.path)) ? c.copied : c.copyFailed)}><Copy size={14}/>{c.copyOne}</button></li>)}</ol></section>}
    {!shares ? !error && <CardsLoading label={c.loadingLinks}/> : <ul className="cpl-rows">{pupils.map(pupil => {const share = latest(pupil.id), open = share?.state === 'active'; return <li key={pupil.id}><span>{pupil.number}. {pupil.name}</span><small className={open ? 'is-open' : ''}>{stateText(share)}</small><span className="cards-actions"><button type="button" className="button" disabled={busy} onClick={() => void create([pupil.id])}>{open ? c.remake : c.create}</button>{open && <button type="button" className="button" disabled={busy} onClick={() => void revoke(share.id)}>{c.revoke}</button>}</span></li>;})}</ul>}
    <div className="cards-dialog-footer cards-actions"><button type="button" className="button" onClick={onClose}>{c.close}</button></div>
  </div></CardsDialog>;
}
