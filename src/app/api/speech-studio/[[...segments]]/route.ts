import {speechStudio} from '@/modules/speech-studio/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
type RouteContext={params:Promise<{segments?:string[]}>};
export async function GET(request:Request,{params}:RouteContext){return speechStudio(request,(await params).segments??[]);}
export async function POST(request:Request,{params}:RouteContext){return speechStudio(request,(await params).segments??[]);}
export async function DELETE(request:Request,{params}:RouteContext){return speechStudio(request,(await params).segments??[]);}
