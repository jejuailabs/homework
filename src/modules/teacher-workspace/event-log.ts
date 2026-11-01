import 'server-only';
import {db} from '@/lib/server/admin';
import {eventSummary} from './policy';
import {WORKSPACE_EVENT_TYPES, type WorkspaceEventType, type WorkspaceLogEvent} from './types';

type Writer = FirebaseFirestore.Transaction | FirebaseFirestore.WriteBatch;
const log = (uid: string) => db().collection(`teacherEvents/${uid}/log`);

/**
 * One line per write. The line names the collection and document but carries no title, body or student name;
 * sensitive lines are kept for the teacher's own audit and never leave through the event feed.
 * Pass a transaction or batch to commit the line with the write it describes.
 */
export function logWorkspaceEvent(uid: string, type: WorkspaceEventType, ref: {collection: string; id: string}, options: {count?: number; sensitive?: boolean; writer?: Writer} = {}) {
  const line = {type, at: new Date().toISOString(), ref, summary: eventSummary(type, options.count), sensitive: options.sensitive === true};
  const doc = log(uid).doc();
  if (options.writer) {(options.writer as FirebaseFirestore.WriteBatch).set(doc, line); return Promise.resolve();}
  return doc.set(line).then(() => undefined);
}
/** Non-sensitive log lines after `since`, oldest first. */
export async function readWorkspaceLog(uid: string, since: string | null, limit: number): Promise<{events: WorkspaceLogEvent[]; hasMore: boolean; lastAt: string | null}> {
  const snap = await log(uid).where('at', '>', since ?? new Date(0).toISOString()).orderBy('at').limit(limit + 1).get();
  const docs = snap.docs.slice(0, limit);
  const events = docs.flatMap(doc => {
    const data = doc.data();
    if (data.sensitive || !WORKSPACE_EVENT_TYPES.includes(data.type)) return [];
    return [{id: `log:${doc.id}`, type: data.type as WorkspaceEventType, at: String(data.at), ref: {collection: String(data.ref?.collection ?? ''), id: String(data.ref?.id ?? '')}, summary: String(data.summary ?? ''), sensitive: false}];
  });
  // The cursor advances past skipped sensitive lines too, so a consumer never re-reads them.
  return {events, hasMore: snap.size > limit, lastAt: docs.length ? String(docs[docs.length - 1].data().at) : null};
}
