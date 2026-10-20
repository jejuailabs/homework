import AccessGate from '@/components/access-gate';
import TeacherDailyQuiz from '@/modules/daily-quiz/teacher';
export default function TeacherDailyQuizPage() {return <AccessGate role="teacher"><TeacherDailyQuiz/></AccessGate>;}
