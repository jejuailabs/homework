import {publicCardShare} from '@/lib/server/cards-shares';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: {params: Promise<{token: string}>}) {return publicCardShare(request, (await context.params).token);}
