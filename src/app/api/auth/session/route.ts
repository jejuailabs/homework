import { handle } from '@/lib/server/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return handle(request, 'session'); }
export async function DELETE(request: Request) { return handle(request, 'session'); }
