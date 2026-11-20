export type RecordKind = 'homework' | 'artwork' | 'points';
export const RECORD_KIND_LABELS: Record<RecordKind, string> = {homework: '숙제 말씀', artwork: '작품 한마디', points: '보말 칭찬'};
export type StudentRecord = {kind: RecordKind; date: string; title: string; text: string};
export type StudentRow = {id: string; name: string; number: number; records: StudentRecord[]};
export type StudentRecords = {classId: string; className: string; from: string; to: string; truncated: boolean; students: StudentRow[]};
