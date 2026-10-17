import { NextResponse } from 'next/server';
import { ApiError, id } from '@/lib/server/policy';
import { assertOrigin } from '@/lib/server/auth';
import { readBoundedJson } from '@/lib/server/ai-policy';
import { artbookHost, catalog, privateImage, roster } from '@/modules/digital-artbook/exhibition-source';
import { bookStatus, createBook, deleteBook, downloadBook, listBooks, stepBook } from '@/modules/digital-artbook/server';
import { BookInputError } from '@/modules/digital-artbook/policy';
export const runtime = 'nodejs', dynamic = 'force-dynamic', maxDuration = 120;
type Params = {params: Promise<{container: string; segments?: string[]}>};
const headers = {'Cache-Control': 'private,no-store'};
async function handle(request: Request, context: Params) {
  try {
    if (request.method !== 'GET') assertOrigin(request);
    const {container, segments: s = []} = await context.params;
    const host = await artbookHost(request, container), params = new URL(request.url).searchParams;
    let value: unknown;
    if (request.method === 'GET' && !s.length) value = params.get('students') === '1' ? await roster(host, params.get('cursor') || '') : await catalog(host, params);
    else if (request.method === 'GET' && s[0] === 'image' && s.length === 3) {const image = await privateImage(host, id(s[1]), id(s[2])); return new Response(new Uint8Array(image.bytes), {headers: {...headers, 'Content-Type': image.contentType}});}
    else if (s[0] === 'jobs' && s.length === 1) {
      if (request.method === 'GET') value = await listBooks(host);
      else if (request.method === 'POST') {
        const input = await readBoundedJson(request, 24_000);
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, '화집 설정을 확인해 주세요.');
        value = await createBook(host, input as Record<string, any>, new URL(request.url).origin);
      }
      else throw new ApiError(405, '지원하지 않는 요청이에요.');
    } else if (s[0] === 'jobs' && s.length >= 2 && s.length <= 3) {
      const job = id(s[1]);
      if (request.method === 'GET' && s.length === 2) value = await bookStatus(host, job);
      else if (request.method === 'DELETE' && s.length === 2) value = await deleteBook(host, job);
      else if (request.method === 'POST' && s[2] === 'step') value = await stepBook(host, job);
      else if (request.method === 'GET' && s[2] === 'pdf') {
        const result = await downloadBook(host, job);
        return new Response(new Uint8Array(result.bytes), {headers: {...headers, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="artbook.pdf"; filename*=UTF-8''${encodeURIComponent(result.filename)}`}});
      } else throw new ApiError(404, '아트북 기능을 찾을 수 없어요.');
    } else throw new ApiError(404, '아트북 기능을 찾을 수 없어요.');
    return NextResponse.json(value, {headers});
  } catch (e) {return NextResponse.json({error: e instanceof ApiError || e instanceof BookInputError ? e.message : '아트북 작업을 완료하지 못했어요.'}, {status: e instanceof ApiError ? e.status : e instanceof BookInputError ? 400 : 500, headers});}
}
export const GET = handle, POST = handle, DELETE = handle;
