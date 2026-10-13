import { handle } from '@/lib/server/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return handle(request, 'assignments'); }
export async function POST(request: Request) { return handle(request, 'assignments'); }
