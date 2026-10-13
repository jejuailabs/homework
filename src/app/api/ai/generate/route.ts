import {NextResponse} from 'next/server';
import {generateAiDraft} from '@/lib/server/ai';
import {AiError} from '@/lib/server/ai-policy';
import {ApiError} from '@/lib/server/policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const headers: Record<string, string> = {'Cache-Control': 'no-store'};
  try {return NextResponse.json(await generateAiDraft(request), {headers});}
  catch (error) {
    if (error instanceof AiError && error.retryAfter) headers['Retry-After'] = String(error.retryAfter);
    if (error instanceof ApiError) return NextResponse.json({error: error.message, code: error.code}, {status: error.status, headers});
    // Never log provider payloads, credentials, teacher input or generated text.
    console.error('AI generation failed', 'INTERNAL_ERROR');
    return NextResponse.json({error: '초안을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'INTERNAL_ERROR'}, {status: 500, headers});
  }
}
