'use client';
import { useEffect, useRef, useState } from 'react';
export function useDraft<T extends {
    version: number;
}>(initial: T, save: (value: T) => Promise<T>, enabled: boolean) {
    const [draft, setDraft] = useState(initial), [saved, setSaved] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), past = useRef<T[]>([]), future = useRef<T[]>([]), version = useRef(initial.version), current = useRef(draft), sequence = useRef(0), active = useRef(true), writer = useRef(save), busy = useRef(false), gesture = useRef(false), gestureRecorded = useRef(false), mayExit = useRef(false);
    writer.current = save;
    current.current = draft;
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    function edit(next: T, remember = true) { if (!enabled)
        return; mayExit.current = false; if (remember && (!gesture.current || !gestureRecorded.current)) {
        gestureRecorded.current = gesture.current;
        past.current = [...past.current.slice(-29), current.current];
        future.current = [];
    } sequence.current++; current.current = next; setDraft(next); setSaved(false); }
    async function flush() { if (saved)
        return true; if (busy.current || !enabled || error)
        return false; busy.current = true; setSaving(true); const seq = sequence.current; try {
        const result = await writer.current({ ...current.current, version: version.current });
        if (!active.current)
            return false;
        version.current = result.version;
        current.current = { ...current.current, version: result.version };
        setDraft(current.current);
        if (seq === sequence.current)
            setSaved(true);
        return seq === sequence.current;
    }
    catch (e) {
        if (active.current)
            setError((e as Error).message);
        return false;
    }
    finally {
        busy.current = false;
        if (active.current)
            setSaving(false);
    } }
    useEffect(() => { if (saved)
        return; const guard = (event: BeforeUnloadEvent) => { if (!mayExit.current)
        event.preventDefault(); }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [saved]);
    useEffect(() => { if (saved || saving || error || !enabled)
        return; const timer = setTimeout(() => void flush(), 1100); return () => clearTimeout(timer); }, [draft, saved, saving, error, enabled]);
    function undo() { const prior = past.current.pop(); if (!prior)
        return; future.current.push(current.current); edit(prior, false); }
    function redo() { const next = future.current.pop(); if (!next)
        return; past.current.push(current.current); edit(next, false); }
    function begin() { if (!enabled)
        return; gesture.current = true; gestureRecorded.current = false; }
    function end() { gesture.current = false; gestureRecorded.current = false; }
    return { discard: () => { mayExit.current = true; }, begin, end, draft, edit, saved, saving, error, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0, retry: () => setError(''), flush };
}
