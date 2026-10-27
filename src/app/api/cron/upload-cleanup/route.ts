import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {cleanupExpiredExhibitionUploads} from '@/lib/server/exhibitions';
import {cleanupHomeworkUploads} from '@/lib/server/homework-uploads';
import {cleanupExpiredAssignmentMaterials} from '@/lib/server/assignment-materials';
import {cleanupStorageExports} from '@/lib/server/storage-export';
import {cleanupVideoJobs} from '@/lib/server/video-submissions';
import {cleanupPlayRooms} from '@/modules/playground/rooms-server';
export const runtime='nodejs',dynamic='force-dynamic',maxDuration=240;
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET;if(!secret)return NextResponse.json({error:'예약 인증 설정이 필요해요.'},{status:503});
  const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(request.headers.get('authorization')||'');
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return NextResponse.json({error:'인증이 필요해요.'},{status:401});
  try{return NextResponse.json({homework:await cleanupHomeworkUploads(),gallery:await cleanupExpiredExhibitionUploads(),materials:await cleanupExpiredAssignmentMaterials(),videos:await cleanupVideoJobs(),exports:await cleanupStorageExports(),playground:await cleanupPlayRooms()});}
  catch{console.error('Upload cleanup deferred');return NextResponse.json({error:'정리 작업을 다시 시도해 주세요.'},{status:503});}
}
