import AccessGate from '@/components/access-gate';
import DailyQuizLab from '@/modules/daily-quiz/lab';
export default function StudentDailyQuizPage() {return <AccessGate role="student"><DailyQuizLab publicMode/></AccessGate>;}
