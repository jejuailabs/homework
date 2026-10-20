import {handleQuizCron} from '@/modules/daily-quiz/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(request: Request) {return handleQuizCron(request);}
