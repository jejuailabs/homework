import {handleDeveloperMailbox} from '@/lib/server/developer-mailbox';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {return handleDeveloperMailbox(request);}
