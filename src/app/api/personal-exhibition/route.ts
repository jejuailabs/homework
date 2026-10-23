import {NextResponse} from 'next/server';
import {requireStudent} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {readPersonalExhibition} from '@/modules/personal-exhibition/server';

export const runtime = 'nodejs';
const headers = {'Cache-Control': 'private, no-store'};

export async function GET(request: Request) {
  try {
    const ctx = await requireStudent(request);
    return NextResponse.json(await readPersonalExhibition(ctx, new URL(request.url).searchParams.get('cursor')), {headers});
  } catch (error) {
    if (!(error instanceof ApiError)) console.error('[personal-exhibition]', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json({error: error instanceof ApiError ? error.message : '작품을 불러오지 못했어요.', code: error instanceof ApiError ? error.code : 'GALLERY_ERROR'}, {status: error instanceof ApiError ? error.status : 500, headers});
  }
}
