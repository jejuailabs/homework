'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {useLocale, useTranslations} from 'next-intl';
import {ArrowRight, Layers, Sparkles} from 'lucide-react';
import {summarizeStudentCards, type StudentCardsSummary} from '@/lib/cards-summary';

function statusLine(summary: StudentCardsSummary | null, locale: string) {
  const ko = locale === 'ko';
  if (!summary?.assigned) return ko ? '단어·문장 익히기' : 'Learn words and sentences';
  if (!summary.unfinished) return ko ? `세트 ${summary.assigned}개를 모두 마쳤어요` : `All ${summary.assigned} sets done`;
  const head = ko ? `오늘 할 세트 ${summary.unfinished}개 · 전체 ${summary.assigned}개` : `${summary.unfinished} of ${summary.assigned} sets to do today`;
  if (summary.nearestDue) {
    const date = new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric', timeZone: 'Asia/Seoul'}).format(new Date(summary.nearestDue));
    return `${head} · ${ko ? `마감 ${date}` : `due ${date}`}`;
  }
  return summary.overdue ? `${head} · ${ko ? `마감 지난 세트 ${summary.overdue}개` : `${summary.overdue} past due`}` : head;
}

/** Fetches on its own after the home has rendered: if this fails, the link still works and only the numbers are missing. */
export default function StudentCardsEntry() {
  const common = useTranslations('common'), locale = useLocale();
  const [summary, setSummary] = useState<StudentCardsSummary | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/cards/student', {cache: 'no-store', signal: controller.signal})
      .then(response => response.ok ? response.json() : null)
      .then(data => {if (Array.isArray(data?.distributions)) setSummary(summarizeStudentCards(data.distributions));})
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return <Link href="/student/cards" className="sd-gallery-entry sd-cards-entry">
    <span className="sd-gallery-icon"><Layers size={26}/></span>
    <span className="sd-gallery-copy"><strong>{common('cards')}<Sparkles size={17}/></strong><span>{statusLine(summary, locale)}</span></span>
    <span className="sd-gallery-art" aria-hidden="true"><img src="/characters/hamster-kong.webp" alt=""/></span>
    <span className="sd-gallery-arrow"><ArrowRight size={20}/></span>
  </Link>;
}
