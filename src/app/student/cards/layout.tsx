import type {ReactNode} from 'react';
import AccessGate from '@/components/access-gate';

export default function StudentCardsLayout({children}: {children: ReactNode}) {
  return <AccessGate role="student">{children}</AccessGate>;
}
