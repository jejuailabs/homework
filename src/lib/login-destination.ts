/** Preserve a shared board across sign-in without accepting an external redirect. */
export function loginDestination(role: string, next: string | null): string {
  const base = role === 'student' ? '/student' : '/teacher';
  if (!next || !/^\/(teacher|student)\/boards(?:\?|$)/.test(next)) return base;
  try {
    const target = new URL(next, 'https://app.invalid');
    if (target.origin !== 'https://app.invalid') return base;
    const board = target.searchParams.get('board');
    return board && /^[A-Za-z0-9_-]{1,200}$/.test(board) ? `${base}/boards?board=${encodeURIComponent(board)}` : `${base}/boards`;
  } catch {return base;}
}
