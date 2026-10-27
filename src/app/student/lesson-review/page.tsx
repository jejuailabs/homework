import AccessGate from '@/components/access-gate';
import StudentLessonReview from '@/modules/lesson-review/student';
export default function StudentLessonReviewPage() {return <AccessGate role="student"><StudentLessonReview/></AccessGate>;}
