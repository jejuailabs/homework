import {NextResponse} from 'next/server';
import {protectedResourceMetadata} from '@/modules/berry-connector/policy';
import {cors, disabled, issuer} from '@/modules/berry-connector/oauth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (disabled()) return NextResponse.json({error: 'not_found'}, {status: 404});
  return NextResponse.json(protectedResourceMetadata(issuer(request)), {headers: {...cors, 'Cache-Control': 'public, max-age=300'}});
}
export async function OPTIONS() {return new NextResponse(null, {status: 204, headers: cors});}
