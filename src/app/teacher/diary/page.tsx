import AccessGate from '@/components/access-gate';
import DiaryReceived from '@/modules/my-space/diary-received';
export default function SharedDiaryPage(){return <AccessGate role="teacher"><DiaryReceived/></AccessGate>;}
