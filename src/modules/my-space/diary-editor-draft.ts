'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import type {DiaryPage} from './catalog';

/** Private drafts live only in memory. Acknowledgements never replace newer typing. */
export function useDiaryDraft(initial: DiaryPage, save: (page: DiaryPage) => Promise<DiaryPage>) {
  const isNew = !initial.updatedAt;
  const [draft, setDraft] = useState(initial), [dirty, setDirty] = useState(isNew), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const current = useRef(initial), writer = useRef(save), revision = useRef(initial.version), sequence = useRef(isNew ? 1 : 0), savedSequence = useRef(0);
  const history = useRef<DiaryPage[]>([]), future = useRef<DiaryPage[]>([]), gesture = useRef(false), remembered = useRef(false);
  const alive = useRef(true), pending = useRef<Promise<boolean> | null>(null);
  writer.current = save;
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);

  const edit = useCallback((next: DiaryPage, remember = true) => {
    if (remember && (!gesture.current || !remembered.current)) {
      history.current = [...history.current.slice(-39), current.current];
      future.current = [];
      remembered.current = true;
    }
    current.current = next;
    sequence.current++;
    setDraft(next);
    setDirty(true);
  }, []);

  const flush = useCallback((): Promise<boolean> => {
    if (pending.current) return pending.current;
    if (sequence.current === savedSequence.current) return Promise.resolve(true);
    setSaving(true);
    setError('');
    pending.current = (async () => {
      try {
        while (alive.current && sequence.current !== savedSequence.current) {
          const writingSequence = sequence.current;
          const value = {...current.current, version: revision.current, schemaVersion: 2 as const};
          if (new TextEncoder().encode(JSON.stringify(value)).length > 590000) throw new Error('이 페이지에 담긴 이야기가 많아요. 새 페이지에 이어 써 주세요.');
          const acknowledged = await writer.current(value);
          revision.current = acknowledged.version;
          savedSequence.current = writingSequence;
          if (!alive.current) return false;
          current.current = {...current.current, version: acknowledged.version, updatedAt: acknowledged.updatedAt};
          setDraft(current.current);
          setDirty(sequence.current !== savedSequence.current);
        }
        return alive.current;
      } catch (reason) {
        if (alive.current) setError(reason instanceof Error ? reason.message : '저장하지 못했어요. 다시 시도해 주세요.');
        return false;
      } finally {
        pending.current = null;
        if (alive.current) setSaving(false);
      }
    })();
    return pending.current;
  }, []);

  useEffect(() => {
    if (!dirty || saving || error) return;
    const timeout = setTimeout(() => {if (!gesture.current) void flush();}, 1200);
    return () => clearTimeout(timeout);
  }, [draft, dirty, saving, error, flush]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {event.preventDefault();};
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push(current.current);
    edit({...previous, version: revision.current}, false);
  }
  function redo() {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(current.current);
    edit({...next, version: revision.current}, false);
  }
  return {
    draft, edit, flush, dirty, saving, error, undo, redo,
    canUndo: history.current.length > 0, canRedo: future.current.length > 0,
    begin: () => {gesture.current = true; remembered.current = false;},
    end: () => {gesture.current = false; remembered.current = false;},
    current: () => current.current,
  };
}
