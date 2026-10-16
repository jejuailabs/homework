import {publicExhibition} from '@/lib/server/exhibitions';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: {params: Promise<{token: string}>}) {return publicExhibition(request, (await context.params).token);}
