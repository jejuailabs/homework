import {NextResponse} from 'next/server';
import {requireTeacher} from '@/lib/server/auth';
import {db} from '@/lib/server/admin';
import {ApiError} from '@/lib/server/policy';
import {exhibitionStorageLimit} from '@/lib/server/exhibition-policy';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const ctx = await requireTeacher(request), classes = await db().collection('classes').where('ownerUid','==',ctx.uid).get();
    const [gallery, materials, uploads, stats] = await Promise.all([db().doc(`exhibitionStorage/${ctx.uid}`).get(),db().collection('assignmentMaterials').where('ownerUid','==',ctx.uid).get(),Promise.all(classes.docs.map(cls=>db().collection('uploads').where('classId','==',cls.id).get())),db().collection('uploadTransferStats').where('ownerUid','==',ctx.uid).get()]);
    const homework = uploads.flatMap(s=>s.docs).map(doc=>doc.data()), reference = materials.docs.map(doc=>doc.data());
    const sum=(rows:FirebaseFirestore.DocumentData[],field:string)=>rows.reduce((n,row)=>n+Number(row[field]||0),0);
    const month = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date());
    return NextResponse.json({homework:{usedBytes:sum(homework.filter(v=>v.status==='submitted'),'size'),reservedBytes:sum(homework.filter(v=>v.status==='pending'||v.status==='cleanup'),'size'),limitBytes:null},gallery:{usedBytes:gallery.data()?.usedBytes||0,reservedBytes:gallery.data()?.reservedBytes||0,limitBytes:exhibitionStorageLimit(process.env.EXHIBITION_STORAGE_LIMIT_BYTES)},materials:{usedBytes:sum(reference.filter(v=>!['pending','cleanup'].includes(v.status)),'size'),reservedBytes:sum(reference.filter(v=>['pending','cleanup'].includes(v.status)),'size'),limitBytes:5*1024**3},month,monthlyUploadedBytes:sum(stats.docs.map(doc=>doc.data()).filter(row=>row.month===month),'bytes'),monthlyTrackingSince:'2026-10-20',downloadBytes:null},{headers:{'Cache-Control':'private,no-store'}});
  } catch(error) {return NextResponse.json({error:error instanceof ApiError?error.message:'저장 현황을 불러오지 못했어요.'},{status:error instanceof ApiError?error.status:500});}
}
