import { NextResponse } from 'next/server';
import { ApiError, id } from '@/lib/server/policy';
import { assertOrigin } from '@/lib/server/auth';
import { readBoundedJson } from '@/lib/server/ai-policy';
import { bookHost, classList, overview, preview, teacher } from '@/modules/class-artbook/source';
import { createJob, deleteJob, downloadLink, jobStatus, listJobs, stepJob } from '@/modules/class-artbook/server';
import { bookOptions, bookSelection, ClassBookInputError } from '@/modules/class-artbook/policy';

/** 우리 반 작품집. Teachers only; reads exhibitions and keeps its own jobs and files. */
export const runtime = 'nodejs', dynamic = 'force-dynamic', maxDuration = 120;
type Params = {params: Promise<{segments?: string[]}>};
const headers = {'Cache-Control': 'private,no-store'};
const missing = () => new ApiError(404, '작품집 기능을 찾을 수 없어요.');
async function body(request: Request) {
  const input = await readBoundedJson(request, 64_000);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, '작품집 설정을 확인해 주세요.');
  return input as Record<string, unknown>;
}
async function handle(request: Request, context: Params) {
  try {
    if (request.method !== 'GET') assertOrigin(request);
    const {segments: s = []} = await context.params;
    let value: unknown;
    if (!s.length) {
      if (request.method !== 'GET') throw missing();
      value = {classes: await classList(await teacher(request))};
    } else {
      const host = await bookHost(request, id(s[0], '학급'));
      if (s.length === 1 && request.method === 'GET') value = await overview(host);
      else if (s[1] === 'preview' && s.length === 2 && request.method === 'POST') {
        const input = await body(request);
        value = await preview(host, bookSelection(input.selection), bookOptions(input.options));
      } else if (s[1] === 'jobs' && s.length === 2) {
        if (request.method === 'GET') value = await listJobs(host);
        else if (request.method === 'POST') value = await createJob(host, await body(request));
        else throw missing();
      } else if (s[1] === 'jobs' && (s.length === 3 || s.length === 4)) {
        const job = id(s[2], '작업 번호');
        if (s.length === 3 && request.method === 'GET') value = await jobStatus(host, job);
        else if (s.length === 3 && request.method === 'DELETE') value = await deleteJob(host, job);
        else if (s[3] === 'step' && request.method === 'POST') value = await stepJob(host, job, new URL(request.url).origin);
        else if (s[3] === 'download' && request.method === 'GET') value = await downloadLink(host, job);
        else throw missing();
      } else throw missing();
    }
    return NextResponse.json(value, {headers});
  } catch (e) {
    const known = e instanceof ApiError || e instanceof ClassBookInputError;
    if (!known) console.error('[class-artbook]', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({error: known ? (e as Error).message : '작품집 작업을 완료하지 못했어요.'}, {status: e instanceof ApiError ? e.status : e instanceof ClassBookInputError ? 400 : 500, headers});
  }
}
export const GET = handle, POST = handle, DELETE = handle;
