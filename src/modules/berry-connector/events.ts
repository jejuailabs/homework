import 'server-only';
import {db} from '@/lib/server/admin';
import {bearer, cors, disabled, errorResponse, json} from './oauth';
import {BerryError, boundedInt, deriveEvents, type AssignmentSummary} from './policy';

/**
 * Teacher change feed for the Berry brain. Phase 0 derives events from assignment summaries on each poll;
 * a write-side event log (notebook, workspace, calendar) replaces this in the next phase. Ids are stable per fact.
 */
export async function handleEvents(request: Request) {
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
  if (disabled()) return json({error: 'not_found'}, 404, cors);
  try {
    const ctx = await bearer(request, 'events:read');
    const params = new URL(request.url).searchParams, since = params.get('since');
    if (since && (since.length > 40 || Number.isNaN(Date.parse(since)))) throw new BerryError('since는 ISO 8601 시각이어야 해요.');
    const limit = boundedInt(params.get('limit') ?? undefined, 200, 1, 500, 'limit'), soonHours = boundedInt(params.get('soon_hours') ?? undefined, 48, 1, 168, 'soon_hours');
    const snap = await db().collection('assignments').where('ownerUid', '==', ctx.uid).select('classId', 'title', 'dueAt', 'createdAt', 'targetCount', 'submittedCount', 'reviewedCount', 'visibility').get();
    const summaries: AssignmentSummary[] = snap.docs.map(doc => {
      const data = doc.data();
      return {id: doc.id, classId: String(data.classId ?? ''), title: String(data.title ?? ''), dueAt: typeof data.dueAt === 'string' ? data.dueAt : null, createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date(0).toISOString(), targetCount: Number(data.targetCount) || 0, submittedCount: Number(data.submittedCount) || 0, reviewedCount: Number(data.reviewedCount) || 0, visibility: typeof data.visibility === 'string' ? data.visibility : undefined};
    });
    const now = new Date().toISOString(), events = deriveEvents(summaries, since, now, soonHours);
    const page = events.slice(0, limit);
    return json({events: page, cursor: page.length ? page[page.length - 1].at : since ?? now, hasMore: events.length > page.length, generatedAt: now, source: 'derived'}, 200, cors);
  } catch (error) {
    return errorResponse(error, {...cors, ...((error as {headers?: Record<string, string>}).headers ?? {})});
  }
}
