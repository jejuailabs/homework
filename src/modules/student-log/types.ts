/** 행동발달 누가기록: what a teacher notes about one student as things happen, and the 평어 made from it. */
export const LOG_KINDS = ['praise', 'growth', 'concern', 'note'] as const;
export type LogKind = typeof LOG_KINDS[number];
export const LOG_KIND_LABELS: Record<LogKind, string> = {praise: '칭찬', growth: '성장', concern: '지도·걱정', note: '관찰'};
export type LogFile = {id: string; name: string};
export type StudentLogEntry = {id: string; studentId: string; date: string; kind: LogKind; body: string; files: LogFile[]; createdAt: string; updatedAt: string};
export type LogStudent = {id: string; name: string; number: number};
export type StudentSummary = {studentId: string; text: string; createdAt: string; entries: number; comments: number};
export type StudentLogs = {classId: string; className: string; students: LogStudent[]; entries: StudentLogEntry[]; summaries: StudentSummary[]};
