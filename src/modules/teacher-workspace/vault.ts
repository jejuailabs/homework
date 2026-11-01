import 'server-only';
import {openEnvelope, sealEnvelope, vaultKey} from '@/modules/teacher-notebook/vault';

/** Same AES-256-GCM envelope as the teacher notebook, under its own derived key. The AAD binds a body to its teacher and item. */
const LABEL = 'teacher-workspace-item';
export const sealItemBody = (body: string, uid: string, itemId: string) => sealEnvelope(vaultKey(LABEL), [LABEL, uid, itemId], body);
/** Null when the envelope is malformed or belongs to another teacher or item. */
export const openItemBody = (envelope: unknown, uid: string, itemId: string) => openEnvelope(vaultKey(LABEL), [LABEL, uid, itemId], envelope);
