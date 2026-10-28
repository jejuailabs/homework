import {handleLessonReview} from '@/modules/lesson-review/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
type RouteContext = {params: Promise<{segments?: string[]}>};
export async function GET(request: Request, context: RouteContext) {return handleLessonReview(request, (await context.params).segments || []);}
export async function POST(request: Request, context: RouteContext) {return handleLessonReview(request, (await context.params).segments || []);}
