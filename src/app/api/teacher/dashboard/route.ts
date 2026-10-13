import { teacherDashboard } from '@/lib/server/teacher-dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return teacherDashboard(request); }
