import {assertOrigin} from '@/lib/server/auth';
import {recordActivity} from '@/lib/server/activity';
import {ApiError} from '@/lib/server/policy';
export const runtime = 'nodejs', dynamic = 'force-dynamic';

/** Screen time from the in-page tracker. Answers without a body; the page never waits on it. */
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const raw = await request.text();
    if (raw.length > 8000) return new Response(null, {status: 413});
    await recordActivity(request, JSON.parse(raw || 'null'));
    return new Response(null, {status: 204});
  } catch (error) {
    return new Response(null, {status: error instanceof ApiError ? error.status : error instanceof SyntaxError ? 400 : 503});
  }
}
