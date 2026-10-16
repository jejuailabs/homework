import 'server-only';
import { db } from '@/lib/server/admin';
/** Container-level bounded review list; independent modules keep independent storage. */
export async function pendingArtworkModules(containerKey: string, enabled: {
    voice: boolean;
    guestbook: boolean;
}) {
    const sources = [['voice', 'moduleVoices'], ['guestbook', 'moduleGuestbooks']] as const;
    const groups = await Promise.all(sources.map(async ([kind, collection]) => { if (!enabled[kind])
        return []; const rows = await db().collection(collection).where('containerKey', '==', containerKey).limit(301).get(); return rows.docs.flatMap(doc => { const v = doc.data(), pending = kind === 'voice' ? Number(!!v.draftId) : Number(v.pendingCount || 0); return pending ? [{ kind, targetId: v.targetId, title: v.title, pending }] : []; }); }));
    return groups.flat();
}
