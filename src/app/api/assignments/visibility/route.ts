import {handleAssignmentVisibility} from '@/lib/server/assignment-visibility';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {return handleAssignmentVisibility(request);}
