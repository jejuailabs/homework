import {handleStudentLog} from '@/modules/student-log/server';
export const runtime = 'nodejs', dynamic = 'force-dynamic', maxDuration = 120;
type RouteContext = {params: Promise<{segments?: string[]}>};
export async function GET(request: Request, context: RouteContext) {return handleStudentLog(request, (await context.params).segments || []);}
export async function POST(request: Request, context: RouteContext) {return handleStudentLog(request, (await context.params).segments || []);}
export async function DELETE(request: Request, context: RouteContext) {return handleStudentLog(request, (await context.params).segments || []);}
