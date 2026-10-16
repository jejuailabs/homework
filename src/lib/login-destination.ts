/** Preserve a shared classroom destination across sign-in without external redirects. */
export function loginDestination(role: string, next: string | null): string {
  const base = role === 'student' ? '/student' : '/teacher';
  if (!next || !/^\/(teacher|student)\/(boards|exhibitions|polls|canvases)(?:\?|$)/.test(next)) return base;
  try {
    const target = new URL(next, 'https://app.invalid');
    if (target.origin !== 'https://app.invalid') return base;
    if (target.pathname.endsWith('/polls') || target.pathname.endsWith('/canvases')) {
      const canvas=target.pathname.endsWith('/canvases'),key=canvas?'canvas':'poll',value=target.searchParams.get(key);
      const path=role==='student'?`${base}/${canvas?'canvases':'polls'}`:`${base}/tools/${canvas?'canvas':'vote'}`;
      return value&&/^[A-Za-z0-9_-]{1,200}$/.test(value)?`${path}?${key}=${encodeURIComponent(value)}`:path;
    }
    if (target.pathname.endsWith('/exhibitions')) {const exhibition = target.searchParams.get('exhibition');return exhibition && /^[A-Za-z0-9_-]{1,200}$/.test(exhibition) ? `${base}/exhibitions?exhibition=${encodeURIComponent(exhibition)}` : `${base}/exhibitions`;}
    const board = target.searchParams.get('board');
    return board && /^[A-Za-z0-9_-]{1,200}$/.test(board) ? `${base}/boards?board=${encodeURIComponent(board)}` : `${base}/boards`;
  } catch {return base;}
}
