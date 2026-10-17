export const ARTBOOK_LIMIT = 60;
export type BookOptions = {
  title: string; displayName: string; dedication: string;
  format: 'a4' | 'mobile'; cover: 'sage' | 'peach' | 'sky'; voiceQr: boolean;
};
export type BookWork = {
  key: string; roomId: string; artworkId: string; title: string; description: string;
  date: string; roomTitle: string; thumbnailUrl: string;
};
export type BookPage = Omit<BookWork, 'thumbnailUrl'> & {
  sourcePath: string; caption: string; captionVersion: string; sourceVersion: string;
  voiceUrl: string; voiceRecordId: string; width: number; height: number;
};
export type BookSnapshot = {
  schema: 1; classId: string; studentId: string; className: string; studentName: string;
  from: string; to: string; createdAt: string; options: BookOptions; pages: BookPage[];
};
export type BookJob = {
  id: string; title: string; displayName: string; createdAt: string;
  status: 'assets' | 'render' | 'ready' | 'failed' | 'deleting'; completed: number; total: number;
  error: string; busy: boolean; size: number;
};
