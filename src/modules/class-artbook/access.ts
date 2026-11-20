import type { Context } from '@/lib/server/auth';

/**
 * Who may open 우리 반 작품집.
 * CLASS_ARTBOOK_MODE: off (no one) / allowlist (default: admins and listed teachers) / all (every teacher).
 * CLASS_ARTBOOK_ALLOW: comma-separated teacher emails or account ids for the allowlist stage.
 */
export function classArtbookAllowed(ctx: Pick<Context, 'uid' | 'email' | 'role' | 'viewedBy'>) {
  if (ctx.role === 'student') return false;
  const mode = (process.env.CLASS_ARTBOOK_MODE || 'allowlist').trim().toLowerCase();
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  if (ctx.role === 'superadmin' || ctx.role === 'admin' || ctx.viewedBy) return true;
  const allow = (process.env.CLASS_ARTBOOK_ALLOW || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  return allow.includes(ctx.uid.toLowerCase()) || (!!ctx.email && allow.includes(ctx.email.toLowerCase()));
}
