import 'server-only';
import {db} from '@/lib/server/admin';
import {bearer, cors, disabled, errorResponse, json} from './oauth';
import {readWorkspaceLog} from '@/modules/teacher-workspace/event-log';
import {BerryError, boundedInt, deriveEvents, mergeEvents, type AssignmentSummary} from './policy';
import type {BerryEvent} from './types';

/**
 * Teacher change feed for the Berry brain: the write-side log of workspace and notebook writes (`source: 'log'`)
 * merged with facts derived from assignment summaries on each poll (`source: 'derived'`). Ids are stable per fact.
 * Sensitive log lines never appear here.
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
    const now = new Date().toISOString(), log = await readWorkspaceLog(ctx.uid, since, limit);
    let events: BerryEvent[] = mergeEvents(log.events.map(({sensitive: _, ...event}) => ({...event, source: 'log' as const})), deriveEvents(summaries, since, now, soonHours));
    // Log lines past the fetched page are unknown yet: stop there so the cursor cannot skip them.
    if (log.hasMore && log.lastAt) events = events.filter(event => event.at <= log.lastAt!);
    const page = events.slice(0, limit);
    return json({events: page, cursor: page.length ? page[page.length - 1].at : since ?? now, hasMore: log.hasMore || events.length > page.length, generatedAt: now, sources: ['log', 'derived']}, 200, cors);
  } catch (error) {
    return errorResponse(error, {...cors, ...((error as {headers?: Record<string, string>}).headers ?? {})});
  }
}
