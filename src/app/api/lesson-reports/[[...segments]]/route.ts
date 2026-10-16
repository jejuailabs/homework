import {lessonReports} from '@/lib/server/lesson-reports';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
type RouteContext={params:Promise<{segments?:string[]}>};
export async function GET(request:Request,{params}:RouteContext){return lessonReports(request,(await params).segments??[]);}
export async function POST(request:Request,{params}:RouteContext){return lessonReports(request,(await params).segments??[]);}
