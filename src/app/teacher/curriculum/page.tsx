import AccessGate from '@/components/access-gate';
import CurriculumWorkspace from '@/modules/curriculum/workspace';
/** 숨김 시험 중: 메뉴·첫 화면에 링크가 없고, 공개 범위(featureAccess/curriculum) 밖이면 잠금 안내만 보인다. */
export default function CurriculumPage() {return <AccessGate role="teacher"><CurriculumWorkspace/></AccessGate>;}
