import {handleAssignmentMaterials} from '@/lib/server/assignment-materials';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: {params: Promise<{id: string}>}) {return handleAssignmentMaterials(request, (await context.params).id);}
export async function DELETE(request: Request, context: {params: Promise<{id: string}>}) {return handleAssignmentMaterials(request, (await context.params).id);}
