import {handlePublicQuiz} from '@/modules/daily-quiz/public-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type RouteContext = {params: Promise<{segments?: string[]}>};
export async function GET(request: Request, context: RouteContext) {return handlePublicQuiz(request, (await context.params).segments || []);}
export async function POST(request: Request, context: RouteContext) {return handlePublicQuiz(request, (await context.params).segments || []);}
