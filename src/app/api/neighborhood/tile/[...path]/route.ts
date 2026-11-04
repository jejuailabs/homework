import {neighborhoodTileRoute} from '@/lib/server/neighborhood-explore';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{path:string[]}>}){return neighborhoodTileRoute(request,(await params).path);}
