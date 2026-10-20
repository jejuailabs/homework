import {NextResponse} from 'next/server';
import {assertOrigin, requireTeacher} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {latestStorageExport, startStorageExport} from '@/lib/server/storage-export';
export const runtime = 'nodejs', dynamic = 'force-dynamic', maxDuration = 60;
const fail = (error: unknown) => NextResponse.json({error: error instanceof ApiError ? error.message : '최종 다운로드를 준비하지 못했어요.', code: error instanceof ApiError ? error.code : 'EXPORT_FAILED'}, {status: error instanceof ApiError ? error.status : 500});
const ok = (value: unknown, status = 200) => NextResponse.json({export: value}, {status, headers: {'Cache-Control': 'private,no-store'}});
export async function GET(request: Request) {try {return ok(await latestStorageExport((await requireTeacher(request)).uid));} catch (error) {return fail(error);}}
export async function POST(request: Request) {try {assertOrigin(request); return ok(await startStorageExport((await requireTeacher(request)).uid), 202);} catch (error) {return fail(error);}}
