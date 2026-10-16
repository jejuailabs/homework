import type { Transaction } from 'firebase-admin/firestore';
import type { ArtworkModuleOptions } from './types';
export type ModuleCapability = 'record' | 'manage' | 'guestbook-sticker' | 'guestbook-comment' | 'view';
/** Host adapters supply access. Feature modules never read exhibitions/classes directly. */
export type ModuleTarget = {
    key: string;
    ownerUid: string;
    classId: string;
    containerKey: string;
    targetId: string;
    title: string;
    options: ArtworkModuleOptions;
    actor: {
        key: string;
        uid?: string;
        name: string;
        role: 'teacher' | 'student' | 'visitor';
    };
    manage: boolean;
    contribute: boolean;
    record: boolean;
    publicView: boolean;
    assertFresh: (tx: Transaction, capability: ModuleCapability) => Promise<void>;
};
