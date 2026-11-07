'use client';
import {useCallback, useEffect, useState} from 'react';
import {BookOpen, ChartNoAxesColumn, Mic} from 'lucide-react';
import type {ClassroomRosterEntry} from '@/components/classroom-shared';
import Reader from './reader';
import type {VoiceProvider} from './read-aloud';
import Practice, {type PracticePreset} from './practice';
import Records from './records';
import type {Book} from './books';
import type {SpeechRecord} from './policy';
import './styles.css';

type Tab = 'library' | 'practice' | 'records';
const tabs: {id: Tab; name: string; icon: typeof BookOpen}[] = [
  {id: 'library', name: '동화 서재', icon: BookOpen}, {id: 'practice', name: '말하기 연습', icon: Mic}, {id: 'records', name: '기록·수준', icon: ChartNoAxesColumn},
];

/**
 * 말하기·읽기 스튜디오: listen to a book, read it back, speak on a topic, and see each child's level.
 * Teacher tool first; the same pieces are meant to move to the student page after classroom testing.
 */
export default function SpeechStudio({classId, roster, storageScope}: {classId: string; roster: ClassroomRosterEntry[]; storageScope: string}) {
  const [tab, setTab] = useState<Tab>('library'), [books, setBooks] = useState<Book[]>([]), [preset, setPreset] = useState<PracticePreset>(null);
  const [ai, setAi] = useState(false), [voiceProvider, setVoiceProvider] = useState<VoiceProvider | null>(null), [records, setRecords] = useState<SpeechRecord[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [truncated, setTruncated] = useState(false);
  const scope = storageScope.split(':')[0] || 'teacher';
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(classId ? `/api/speech-studio/records?classId=${encodeURIComponent(classId)}` : '/api/speech-studio/status', {cache: 'no-store'});
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || '기록을 불러오지 못했어요.');
      setAi(Boolean(data.ai)); setVoiceProvider(data.voice === 'google' || data.voice === 'openai' ? data.voice : null); setRecords(Array.isArray(data.records) ? data.records : []); setTruncated(Boolean(data.truncated));
    } catch (reason) {setError(reason instanceof Error ? reason.message : '기록을 불러오지 못했어요.');}
    finally {setLoading(false);}
  }, [classId]);
  useEffect(() => {void load();}, [load]);
  async function remove(record: SpeechRecord) {
    const response = await fetch(`/api/speech-studio/records/${encodeURIComponent(record.id)}`, {method: 'DELETE'});
    if (response.ok) setRecords(list => list.filter(r => r.id !== record.id));
    else setError('기록을 지우지 못했어요.');
  }
  return <div className="ss-root">
    <div className="ss-tabs" role="tablist" aria-label="말하기·읽기 스튜디오">
      {tabs.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}><t.icon size={16}/>{t.name}</button>)}
      <span className="ss-ai" title={ai ? 'AI 전사·피드백·목소리를 쓸 수 있어요. 쓸 때마다 비용이 들어요.' : 'AI 기능이 꺼져 있어요. 기기 기능과 직접 입력으로 쓸 수 있어요.'}>{ai ? 'AI 켜짐' : 'AI 꺼짐 · 무료 기능만'}</span>
    </div>
    <div className="ss-body" hidden={tab !== 'library'}><Reader scope={scope} classId={classId} ai={ai} voiceProvider={voiceProvider} books={books} setBooks={setBooks} onPractice={(book, page) => {setPreset({book, page}); setTab('practice');}}/></div>
    <div className="ss-body" hidden={tab !== 'practice'}><Practice classId={classId} roster={roster} ai={ai} preset={preset} onSaved={record => setRecords(list => [record, ...list])}/></div>
    <div className="ss-body" hidden={tab !== 'records'}><Records records={records} roster={roster} books={books} loading={loading} error={error} truncated={truncated} onDelete={record => void remove(record)}/></div>
  </div>;
}
