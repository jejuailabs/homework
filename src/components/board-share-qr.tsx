'use client';

import {useEffect, useState} from 'react';
import {useLocale} from 'next-intl';

/** Generated locally; no class links or credentials are sent to a QR service. */
export default function BoardShareQR({url}: {url: string}) {
  const locale = useLocale();
  const [source, setSource] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSource(''); setFailed(false);
    import('qrcode').then(module => module.toDataURL(url, {width: 224, margin: 2, errorCorrectionLevel: 'M', color: {dark: '#254e41', light: '#ffffff'}}))
      .then(value => {if (!cancelled) setSource(value);})
      .catch(() => {if (!cancelled) setFailed(true);});
    return () => {cancelled = true;};
  }, [url]);
  return source ? <img src={source} width={224} height={224} alt={locale === 'ko' ? '우리 반 참여보드 입장 QR 코드' : 'QR code to open the class board'} style={{maxWidth: '100%', borderRadius: 16}}/> : <p role="status">{locale === 'ko' ? (failed ? '아래 링크를 복사해서 공유해 주세요.' : 'QR 코드를 만들고 있어요…') : (failed ? 'Copy and share the link below.' : 'Creating QR code…')}</p>;
}
