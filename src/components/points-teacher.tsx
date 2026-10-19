'use client';
import Link from 'next/link';
import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {Check, Gift, RotateCcw, Settings2, Shell} from 'lucide-react';
import type {PointGrantResult, PointSettings, PointStudent} from '@/lib/points-types';
import {notifyPointsChanged} from '@/lib/use-point-sync';
import AccessGate from './access-gate';
import CharacterAvatar from './character-avatar';
import PointsTeacherHistory from './points-teacher-history';
import {pointError, pointLabel, pointsRequest, usePointCopy} from './points-shared';
import '@/styles/points.css';

type ClassInfo = {id: string; name: string; year: number};
type ClassState = {classId: string; className: string; settings: PointSettings; students: PointStudent[]};
export default function PointsTeacher({initialClassId = ''}: {initialClassId?: string}) {return <AccessGate role="teacher"><Teacher initialClassId={initialClassId}/></AccessGate>;}
function Teacher({initialClassId}: {initialClassId: string}) {
  const {ko, locale, copy} = usePointCopy();
  const [classes, setClasses] = useState<ClassInfo[]>([]), [classId, setClassId] = useState(initialClassId), [state, setState] = useState<ClassState | null>(null), [settings, setSettings] = useState<PointSettings | null>(null);
  const [selected, setSelected] = useState<string[]>([]), [amount, setAmount] = useState(10), [reason, setReason] = useState(''), [mode, setMode] = useState<'grant' | 'revoke'>('grant'), [confirm, setConfirm] = useState(false), [revision, setRevision] = useState(0);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const requestRef = useRef<{fingerprint: string; requestId: string} | null>(null), epoch = useRef(0), busyRef = useRef(false), dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true;
    pointsRequest<{classes: ClassInfo[]}>('/api/classes').then(result => {if (!active) return; setClasses(result.classes); setClassId(current => result.classes.some(item => item.id === current) ? current : result.classes[0]?.id || '');}).catch(error => active && setError(pointError(error, ko))).finally(() => active && setLoading(false));
    return () => {active = false;};
  }, [ko]);
  const load = useCallback(async () => {
    if (!classId) return;
    const generation = epoch.current, result = await pointsRequest<ClassState>(`/api/points/classes/${classId}`);
    if (generation === epoch.current) {setState(result); setSettings(result.settings);}
  }, [classId]);
  useEffect(() => {
    epoch.current++; setState(null); setSelected([]); setError(''); setNotice(''); setConfirm(false); requestRef.current = null;
    void load().catch(error => setError(pointError(error, ko)));
    return () => {epoch.current++;};
  }, [classId, load, ko]);
  useEffect(() => {if (confirm) dialog.current?.showModal();}, [confirm]);
  async function action(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {await fn();} catch (error) {setError(pointError(error, ko));}
    finally {busyRef.current = false; setBusy(false);}
  }
  async function saveSettings(event: FormEvent) {
    event.preventDefault(); if (!settings) return;
    await action(async () => {
      const result = await pointsRequest<{settings: PointSettings}>(`/api/points/classes/${classId}/settings`, {method: 'POST', body: JSON.stringify(settings)});
      setSettings(result.settings); setState(current => current?.classId === classId ? {...current, settings: result.settings} : current); notifyPointsChanged(); setNotice(copy('학급 포인트 설정을 저장했어요.', 'Class point settings saved.'));
    });
  }
  async function adjust() {
    await action(async () => {
      const payload = {studentIds: [...selected].sort(), amount, reason: reason.trim()}, fingerprint = JSON.stringify({...payload, classId, mode});
      if (requestRef.current?.fingerprint !== fingerprint) requestRef.current = {fingerprint, requestId: crypto.randomUUID()};
      const result = await pointsRequest<PointGrantResult>(`/api/points/classes/${classId}/${mode}`, {method: 'POST', body: JSON.stringify({...payload, requestId: requestRef.current.requestId})});
      const updated = new Map(result.students.map(student => [student.id, student]));
      setState(current => current?.classId === classId ? {...current, students: current.students.map(student => ({...student, ...updated.get(student.id)}))} : current);
      requestRef.current = null; setSelected([]); setReason(''); setConfirm(false); setRevision(current => current + 1); notifyPointsChanged();
      setNotice(mode === 'revoke' ? copy('선택한 학생의 보말을 회수하고 사유를 기록했어요.', 'Points recovered and the reason recorded.') : copy('선택한 학생에게 포인트를 지급했어요.', 'Points awarded to the selected students.'));
    });
  }
  function submit(event: FormEvent) {event.preventDefault(); if (mode === 'revoke') {setError(''); setConfirm(true);} else void adjust();}
  const active = state?.students.filter(student => !student.disabled) || [], chosen = state?.students.filter(student => selected.includes(student.id)) || [];
  const label = settings ? pointLabel(settings, locale) : copy('보말', 'Bomal'), revoking = mode === 'revoke', canAdjust = revoking || !!state?.settings.enabled;
  const insufficient = revoking && chosen.some(student => student.points < amount), validAmount = Number.isSafeInteger(amount) && amount > 0;
  return <main className="points-page">
    <header className="points-heading"><div><span className="points-eyebrow">{copy('우리 반의 작은 성장 보상', 'Small rewards for growing together')}</span><h1><Shell size={30}/>{copy('포인트와 캐릭터 꾸미기', 'Points & character wardrobe')}</h1><p>{copy('참여와 노력을 격려하고, 모은 보말로 친구와 작은 세상을 꾸며요.', 'Celebrate effort and participation. Students decorate their friends and little worlds with Bomal.')}</p></div>{classes.length > 0 && <select aria-label={copy('학급 선택', 'Choose class')} value={classId} disabled={busy} onChange={e => setClassId(e.target.value)}>{classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name} · {cls.year}</option>)}</select>}</header>
    {error && <p className="points-error" role="alert">{error}<button className="button" onClick={() => void action(load)}>{copy('다시 불러오기', 'Reload')}</button></p>}{notice && <p className="points-notice" role="status"><Check size={17}/>{notice}</p>}
    {loading ? <p role="status">{copy('학급을 불러오고 있어요.', 'Loading classes…')}</p> : !classes.length ? <section className="points-empty"><h2>{copy('먼저 학급을 만들어 주세요', 'Create a class first')}</h2><Link className="button primary" href="/teacher">{copy('학급 관리', 'Manage classes')}</Link></section> : !state || !settings ? <p role="status">{copy('포인트 정보를 불러오고 있어요.', 'Loading point settings…')}</p> : <>
      <div className="points-teacher-layout">
        <form className="points-settings" onSubmit={saveSettings}><h2><Settings2 size={21}/>{copy('학급 설정', 'Class settings')}</h2>
          <label className="points-toggle"><input type="checkbox" disabled={busy} checked={settings.enabled} onChange={e => setSettings({...settings, enabled: e.target.checked})}/><span><strong>{copy('포인트와 꾸미기 사용', 'Enable points & wardrobe')}</strong><small>{copy('처음에는 꺼져 있어요. 끄더라도 잔액과 아이템은 보존됩니다.', 'Off by default. Turning it off keeps balances and items safe.')}</small></span></label>
          <label>{copy('포인트 이름', 'Point name')}<input value={settings.label} disabled={busy} maxLength={16} required onChange={e => setSettings({...settings, label: e.target.value})}/></label>
          <label>{copy('숙제 첫 완료 자동 지급', 'Reward for first homework completion')}<input type="number" disabled={busy} min={0} max={Number.MAX_SAFE_INTEGER} step={1} required value={settings.rules.homework} onChange={e => setSettings({...settings, rules: {homework: Number(e.target.value)}})}/><small>{copy('0이면 자동 지급하지 않아요. 이후 처음 완료한 숙제부터 적용됩니다.', 'Set 0 to disable. Applies to homework first completed after this setting is saved.')}</small></label>
          <button className="button primary" disabled={busy}>{copy('설정 저장', 'Save settings')}</button>
          <p className="points-muted">{copy('하루·1회 지급 한도 없이 선생님이 정한 만큼 지급해요. 숙제 자동 보상은 숙제별 첫 완료 시 한 번 지급됩니다.', 'Teachers choose reward amounts without daily or per-award caps. Automatic homework rewards are issued once per assignment.')}</p>
          <p className="points-muted">{copy('포인트는 성장 꽃(XP)과 별개이며, 성적이나 학생 순위로 사용하지 않아요.', 'Points are separate from growth flowers (XP), grades, and rankings.')}</p>
        </form>
        <section className="points-grant"><h2><Gift size={22}/>{copy('보말 수여·회수', 'Award & recover points')}</h2>
          <div className="points-tabs" role="group" aria-label={copy('보말 처리 종류', 'Point action')}><button type="button" disabled={busy} aria-pressed={!revoking} onClick={() => {setMode('grant'); setError(''); setNotice('');}}>{copy('수여하기', 'Award')}</button><button type="button" disabled={busy} aria-pressed={revoking} onClick={() => {setMode('revoke'); setError(''); setNotice('');}}><RotateCcw size={14}/>{copy('회수하기', 'Recover')}</button></div>
          {!state.settings.enabled && !revoking && <p className="points-notice">{copy('학급 설정에서 사용을 켜고 저장해 주세요.', 'Enable the feature in class settings and save first.')}</p>}
          {revoking && <p className="points-muted">{copy('회수할 학생과 수량을 선택하고 사유를 남겨 주세요. 현재 잔액까지만 회수할 수 있고, 누적 획득량과 이전 수여 기록은 보존해요. 기능을 꺼도 회수할 수 있어요.', 'Choose students and an amount, then record a reason. Recovery is limited to the available balance. Lifetime earnings and original award records are kept. Recovery works even when points are disabled.')}</p>}
          <form onSubmit={submit}>
            <div className="points-toolbar"><label><input type="checkbox" disabled={busy || !canAdjust || !active.length} checked={active.length > 0 && selected.length === active.length} onChange={e => setSelected(e.target.checked ? active.map(student => student.id) : [])}/>{copy('전체 선택', 'Select all')} ({selected.length})</label><small>{copy('출석번호순', 'In roster order')}</small></div>
            <div className="points-student-grid">{state.students.map(student => <label key={student.id} className={`points-student ${selected.includes(student.id) ? 'selected' : ''}`}><input type="checkbox" checked={selected.includes(student.id)} disabled={busy || student.disabled || !canAdjust} onChange={e => setSelected(current => e.target.checked ? [...current, student.id] : current.filter(id => id !== student.id))}/><CharacterAvatar character={student.character} outfit={student.wardrobeOutfit}/><span><strong>{student.number}. {student.name}</strong><small>{student.disabled ? copy('이용 중지', 'Inactive') : `${student.points.toLocaleString(locale)} ${label}`}</small></span></label>)}</div>
            {!state.students.length && <p>{copy('학급에 학생을 먼저 등록해 주세요.', 'Add students to your class first.')}</p>}
            <div className="points-grant-fields"><label>{revoking ? copy('회수할 포인트', 'Points to recover') : copy('지급할 포인트', 'Points to award')}<input type="number" min={1} max={Number.MAX_SAFE_INTEGER} step={1} value={amount} required disabled={busy || !canAdjust} onChange={e => setAmount(Number(e.target.value))}/></label><label>{revoking ? copy('회수 사유', 'Reason for recovery') : copy('어떤 노력을 했나요?', 'What effort are you celebrating?')}<input value={reason} maxLength={200} required disabled={busy || !canAdjust} placeholder={revoking ? copy('예: 중복으로 지급한 보말 정정', 'e.g. Correcting a duplicate award') : copy('예: 모둠 친구의 발표를 도왔어요', 'e.g. Helped a classmate present')} onChange={e => setReason(e.target.value)}/></label></div>
            {insufficient && <p className="points-error" role="alert">{copy('선택한 학생 중 잔액이 부족한 학생이 있어요. 수량을 줄이거나 선택을 바꿔 주세요.', 'A selected student has insufficient points. Reduce the amount or change your selection.')}</p>}
            <button className={`button ${revoking ? 'points-revoke-button' : 'primary'}`} disabled={busy || !canAdjust || !selected.length || !reason.trim() || !validAmount || insufficient}><Shell size={17}/>{busy ? copy('처리 중…', 'Saving…') : revoking ? copy(`${selected.length}명에게 ${amount}개씩 회수`, `Recover ${amount} from ${selected.length} students`) : copy(`${selected.length}명에게 ${amount}개씩 지급`, `Award ${amount} to ${selected.length} students`)}</button>
          </form>
        </section>
      </div>
      <PointsTeacherHistory key={classId} classId={classId} students={state.students} revision={revision} label={label}/>
      {confirm && <dialog ref={dialog} className="points-dialog" onCancel={event => {if (busy) event.preventDefault(); else setConfirm(false);}} aria-labelledby="points-revoke-title"><h2 id="points-revoke-title">{copy('보말을 회수할까요?', 'Recover these points?')}</h2><p>{copy(`${chosen.length}명에게 ${amount.toLocaleString(locale)} ${label}씩 회수합니다.`, `Recover ${amount.toLocaleString(locale)} ${label} from each of ${chosen.length} students.`)}</p><ul className="points-revoke-preview">{chosen.map(student => <li key={student.id}><span>{student.number}. {student.name}</span><strong>{student.points.toLocaleString(locale)} → {(student.points - amount).toLocaleString(locale)}</strong></li>)}</ul><p className="points-muted">{copy('사유', 'Reason')}: {reason.trim()}</p>{error && <p className="points-error" role="alert">{error}</p>}<div className="points-actions"><button className="button" disabled={busy} onClick={() => setConfirm(false)}>{copy('취소', 'Cancel')}</button><button className="button points-revoke-button" disabled={busy || insufficient || !validAmount} onClick={() => void adjust()}>{busy ? copy('회수 중…', 'Recovering…') : copy('회수 확정', 'Confirm recovery')}</button></div></dialog>}
    </>}
  </main>;
}
