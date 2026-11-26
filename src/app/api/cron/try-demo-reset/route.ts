import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {resetTryDemoForCron} from '@/modules/try-live/server';

// Every night the login-free tour's demo class goes back to its starting state (seed.ts).
export const runtime = 'nodejs', dynamic = 'force-dynamic', maxDuration = 120;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({error: '예약 인증 설정이 필요해요.'}, {status: 503});
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(request.headers.get('authorization') || '');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return NextResponse.json({error: '인증이 필요해요.'}, {status: 401});
  try {return NextResponse.json(await resetTryDemoForCron());}
  catch (error) {console.error('Try demo reset failed', error instanceof Error ? error.message : error); return NextResponse.json({error: '체험 학급을 다시 만들지 못했어요.'}, {status: 503});}
}
