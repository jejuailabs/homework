export const mailboxStatuses = ['new', 'reviewing', 'completed', 'deferred'] as const;
export type MailboxStatus = typeof mailboxStatuses[number];
export const mailboxStatusLabels: Record<MailboxStatus, string> = {new: '새 편지', reviewing: '검토 중', completed: '반영 완료', deferred: '보류'};
export type MailboxAuthor = {uid: string; role: string; name: string; classId: string; className: string; studentId: string};
export type MailboxLetterSummary = {id: string; title: string; author: MailboxAuthor; status: MailboxStatus; createdAt: string};
export type MailboxLetter = MailboxLetterSummary & {message: string; adminNote: string; version: string};
export const mailboxLimits = {title: 80, message: 2000, note: 1000, daily: 10, cooldownMs: 30_000};
