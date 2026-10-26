import 'server-only';
import {db} from '@/lib/server/admin';
import {ApiError} from '@/lib/server/policy';
import {EXHIBITION_ARTWORK_LIMIT} from '@/lib/server/exhibition-policy';

export type ArtworkReviewEntry = {kind: 'voice' | 'guestbook' | 'legacy-comment'; targetId: string; title: string; pending: number};

/** Join all moderation sources against the current gallery, never orphaned module records. */
export async function pendingArtworkModules(exhibitionId: string, enabled: {voice: boolean; guestbook: boolean}, scope: {ownerUid: string; classId: string}) {
    const store = db(), artworkCollection = store.collection(`exhibitions/${exhibitionId}/artworks`);
    const artworks = await artworkCollection.select('title', 'commentCount').limit(EXHIBITION_ARTWORK_LIMIT + 1).get();
    if (artworks.size > EXHIBITION_ARTWORK_LIMIT) throw new ApiError(409, '작품 목록을 확인하지 못했어요. 전시실을 새로고침해 주세요.', 'REVIEW_ARTWORK_LIMIT');
    const current = new Map(artworks.docs.map(doc => [doc.id, doc]));
    const sources = [['voice', 'moduleVoices'], ['guestbook', 'moduleGuestbooks']] as const;
    const groups = await Promise.all(sources.map(async ([kind, collection]): Promise<ArtworkReviewEntry[]> => {
        if (!enabled[kind] || !current.size) return [];
        // Project small metadata, then remove stale targets. A pre-join limit could hide
        // a real pending record behind old, orphaned module records.
        const rows = await store.collection(collection).where('containerKey', '==', `exhibition:${exhibitionId}`)
            .select('targetId', 'ownerUid', 'classId', 'draftId', 'pendingCount').get();
        return rows.docs.flatMap(doc => {
            const value = doc.data(), artwork = current.get(value.targetId);
            if (!artwork || value.ownerUid !== scope.ownerUid || value.classId !== scope.classId) return [];
            const pending = kind === 'voice' ? Number(!!value.draftId) : Number(value.pendingCount || 0);
            return Number.isSafeInteger(pending) && pending > 0 ? [{kind, targetId: artwork.id, title: String(artwork.data().title || '제목 없는 작품'), pending}] : [];
        });
    }));
    const legacy: ArtworkReviewEntry[] = [];
    // The original class reflections remain reviewable when new participation is off.
    // A missing count belongs to older data, so inspect it instead of assuming zero.
    const withComments = artworks.docs.filter(doc => doc.data().commentCount !== 0);
    for (let offset = 0; offset < withComments.length; offset += 12) {
        const batch = await Promise.all(withComments.slice(offset, offset + 12).map(async artwork => {
            const pending = await artwork.ref.collection('comments').where('status', '==', 'pending').select('status').limit(100).get();
            return pending.size ? {kind: 'legacy-comment' as const, targetId: artwork.id, title: String(artwork.data().title || '제목 없는 작품'), pending: pending.size} : null;
        }));
        legacy.push(...batch.filter((entry): entry is ArtworkReviewEntry & {kind: 'legacy-comment'} => entry !== null));
    }
    return [...groups.flat(), ...legacy].sort((a, b) => a.title.localeCompare(b.title, 'ko') || a.targetId.localeCompare(b.targetId) || a.kind.localeCompare(b.kind));
}
