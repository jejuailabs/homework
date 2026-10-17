export type ArtworkModuleOptions = {
    artbook: { enabled: boolean };
    voice: {
        enabled: boolean;
        publicAudio: boolean;
    };
    guestbook: {
        enabled: boolean;
        students: boolean;
        visitorStickers: boolean;
        visitorComments: boolean;
    };
};
export type ModuleViewer = {
    manage: boolean;
    contribute: boolean;
    visitor: boolean;
};
export const praiseStickers = [
    { id: 'wonderful', emoji: '🌟', ko: '최고예요', en: 'Wonderful!' },
    { id: 'imagination', emoji: '💡', ko: '상상력이 멋져요', en: 'Amazing imagination' },
    { id: 'colors', emoji: '🎨', ko: '색이 아름다워요', en: 'Beautiful colors' },
    { id: 'heart', emoji: '💚', ko: '마음이 따뜻해져요', en: 'Heartwarming' },
    { id: 'story', emoji: '🌈', ko: '이야기가 궁금해요', en: 'Tell me the story' },
    { id: 'effort', emoji: '🌱', ko: '정성이 느껴져요', en: 'Made with care' },
] as const;
export type PraiseSticker = typeof praiseStickers[number]['id'];
export type GuestEntry = {
    id: string;
    type: 'sticker' | 'comment';
    sticker: string;
    text: string;
    authorName: string;
    authorRole: 'visitor' | 'student' | 'teacher';
    status: 'pending' | 'approved' | 'hidden';
    createdAt: string;
    version: string;
    isOwn: boolean;
};
export type VoiceRecording = {
    id: string;
    caption: string;
    duration: number;
    status: 'draft' | 'approved' | 'hidden';
    transcription: 'idle' | 'running' | 'done' | 'failed';
    version: string;
    audioUrl: string;
    error?: string;
};
export function moduleOptions(value: unknown): ArtworkModuleOptions {
    const v = value && typeof value === 'object' ? value as Record<string, any> : {};
    return { artbook: { enabled: v.artbook?.enabled === true }, voice: { enabled: v.voice?.enabled === true, publicAudio: v.voice?.publicAudio === true }, guestbook: { enabled: v.guestbook?.enabled === true, students: v.guestbook?.students !== false, visitorStickers: v.guestbook?.visitorStickers === true, visitorComments: v.guestbook?.visitorComments === true } };
}
