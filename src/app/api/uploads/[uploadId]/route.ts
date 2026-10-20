import {NextResponse} from 'next/server';
import {assertOrigin, requireStudent} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {discardHomeworkUpload} from '@/lib/server/homework-uploads';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function DELETE(request: Request, {params}: {params: Promise<{uploadId: string}>}) {
  try {assertOrigin(request); const ctx = await requireStudent(request); await discardHomeworkUpload((await params).uploadId, ctx.uid); return NextResponse.json({ok: true});}
  catch (error) {return NextResponse.json({error: error instanceof ApiError ? error.message : '정리를 다시 시도해 주세요.'}, {status: error instanceof ApiError ? error.status : 503});}
}
