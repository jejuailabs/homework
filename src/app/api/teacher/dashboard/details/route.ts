import {teacherDashboardDetails} from '@/lib/server/teacher-dashboard-details';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {return teacherDashboardDetails(request);}
