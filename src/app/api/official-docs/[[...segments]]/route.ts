import {handleOfficialDocs} from '@/modules/official-docs/server';
export const runtime = 'nodejs', dynamic = 'force-dynamic', maxDuration = 120;
type RouteContext = {params: Promise<{segments?: string[]}>};
export async function GET(request: Request, context: RouteContext) {return handleOfficialDocs(request, (await context.params).segments || []);}
export async function POST(request: Request, context: RouteContext) {return handleOfficialDocs(request, (await context.params).segments || []);}
export async function DELETE(request: Request, context: RouteContext) {return handleOfficialDocs(request, (await context.params).segments || []);}
