import {handleAssignmentMaterials} from '@/lib/server/assignment-materials';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {return handleAssignmentMaterials(request);}
