import { handle } from '@/lib/server/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Route = {params: Promise<{assignmentId: string}>};
export async function PATCH(request: Request, {params}: Route) { return handle(request, 'submission-edit', (await params).assignmentId); }
export async function DELETE(request: Request, {params}: Route) { return handle(request, 'submission-delete', (await params).assignmentId); }
export async function POST(request: Request, {params}: Route) { return handle(request, 'submission-restore', (await params).assignmentId); }
