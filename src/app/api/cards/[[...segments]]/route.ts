import { handleCards } from '@/lib/server/cards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type RouteContext = { params: Promise<{ segments?: string[] }> };
const handler = async (request: Request, context: RouteContext) => handleCards(request, (await context.params).segments ?? []);
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
