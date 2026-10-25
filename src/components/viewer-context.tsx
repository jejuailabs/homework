'use client';
import {createContext, useCallback, useContext, useEffect, useState, type ReactNode} from 'react';
import {usePathname} from 'next/navigation';

export type VerifiedViewer = {uid: string; role: 'teacher' | 'student' | 'admin' | 'superadmin'};
type ViewerState = {viewer: VerifiedViewer; path: string} | null;
const ViewerContext = createContext<{
  viewer: VerifiedViewer | null;
  setVerifiedViewer: (viewer: VerifiedViewer, path: string) => void;
  clearViewer: () => void;
}>({viewer: null, setVerifiedViewer: () => {}, clearViewer: () => {}});

/** UI visibility only; protected endpoints must independently authorize every request. */
export function ViewerProvider({children}: {children: ReactNode}) {
  const path = usePathname();
  const [verified, setVerified] = useState<ViewerState>(null);
  const setVerifiedViewer = useCallback((viewer: VerifiedViewer, checkedPath: string) => {
    setVerified({viewer, path: checkedPath});
  }, []);
  const clearViewer = useCallback(() => setVerified(null), []);

  useEffect(() => {
    clearViewer();
  }, [path, clearViewer]);
  useEffect(() => {
    window.addEventListener('homework-session-ended', clearViewer);
    return () => window.removeEventListener('homework-session-ended', clearViewer);
  }, [clearViewer]);

  return <ViewerContext.Provider value={{viewer: verified?.path === path ? verified.viewer : null, setVerifiedViewer, clearViewer}}>{children}</ViewerContext.Provider>;
}

export const useVerifiedViewer = () => useContext(ViewerContext);
