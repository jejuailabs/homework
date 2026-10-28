import AccessGate from '@/components/access-gate';
import TeacherLessonReview from '@/modules/lesson-review/teacher';
export default function TeacherLessonReviewPage() {return <AccessGate role="teacher"><TeacherLessonReview/></AccessGate>;}
