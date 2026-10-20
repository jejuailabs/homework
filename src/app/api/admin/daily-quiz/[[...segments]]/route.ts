import {handleQuizLab} from '@/modules/daily-quiz/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, {params}: {params: Promise<{segments?: string[]}>}) {return handleQuizLab(request, (await params).segments || []);}
export async function POST(request: Request, {params}: {params: Promise<{segments?: string[]}>}) {return handleQuizLab(request, (await params).segments || []);}
