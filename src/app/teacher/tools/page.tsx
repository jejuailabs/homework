'use client';

import {useTranslations} from 'next-intl';
import {BookOpen, FileText, HeartHandshake, Languages, MessageCircle, NotebookPen, Sparkles} from 'lucide-react';
import AccessGate from '@/components/access-gate';

const tools = [
  ['resource', BookOpen],
  ['adapt', Languages],
  ['feedback', NotebookPen],
  ['notice', MessageCircle],
  ['conference', HeartHandshake],
  ['notes', FileText]
] as const;

export default function ToolsPage() {
  const t = useTranslations('common.toolbox');
  return <AccessGate role="teacher">
    <p className="page-kicker">{t('kicker')}</p>
    <h1 className="page-title">{t('title')}</h1>
    <p className="page-description">{t('description')}</p>
    <div className="inline-note"><Sparkles size={20}/>{t('note')}</div>
    <div className="tool-grid">
      {tools.map(([key, Icon]) => <article className="tool-card" key={key}>
        <Icon size={25}/>
        <h3>{t('items.' + key + '.title')}</h3>
        <p>{t('items.' + key + '.description')}</p>
        <span className="status-pill">{t('badge')}</span>
      </article>)}
    </div>
  </AccessGate>;
}
