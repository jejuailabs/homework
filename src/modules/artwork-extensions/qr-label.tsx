'use client';
import { useState } from 'react';
import QRCode from 'qrcode';
import { Printer, QrCode } from 'lucide-react';
export default function ArtworkQrLabel({ getLink, title, artist, en = false }: {
    getLink: () => Promise<string>;
    title: string;
    artist: string;
    en?: boolean;
}) {
    const [qr, setQr] = useState(''), [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    async function prepare() { setBusy(true); setError(''); try {
        const link = await getLink();
        setUrl(link);
        setQr(await QRCode.toDataURL(link, { width: 640, margin: 2, errorCorrectionLevel: 'M' }));
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    function print() { const popup = window.open('', '_blank', 'width=700,height=700'); if (!popup) {
        setError(en ? 'Allow popups to print.' : '인쇄 창을 열 수 있도록 팝업을 허용해 주세요.');
        return;
    } popup.opener = null; popup.document.title = title; const style = popup.document.createElement('style'); style.textContent = 'body{font:18px system-ui;text-align:center;padding:28px;color:#294a3e}article{max-width:360px;margin:auto;border:1px solid #c7d5cb;padding:24px;border-radius:16px}img{width:210px;max-width:100%}h1{font-size:24px;overflow-wrap:anywhere}p{overflow-wrap:anywhere}@page{margin:12mm}'; popup.document.head.append(style); const box = popup.document.createElement('article'), heading = popup.document.createElement('h1'), name = popup.document.createElement('p'), image = popup.document.createElement('img'), hint = popup.document.createElement('p'); heading.textContent = title; name.textContent = artist; image.src = qr; image.alt = 'QR'; hint.textContent = en ? 'Scan to hear the artist’s story.' : 'QR을 찍어 작품과 작가의 이야기를 만나 보세요.'; box.append(heading, name, image, hint); popup.document.body.append(box); image.onload = () => { popup.focus(); popup.print(); }; }
    return <div className="am-qr-label"><button type="button" disabled={busy} onClick={() => void prepare()}><QrCode size={15}/>{en ? 'Artwork QR label' : '작품 QR 라벨 만들기'}</button>{qr && <div><img src={qr} alt={en ? 'Artwork QR' : '작품 관람 QR'}/><a href={url} target="_blank" rel="noopener noreferrer">{en ? 'Open artwork' : '작품 관람 페이지 열기'}</a><button type="button" onClick={print}><Printer size={15}/>{en ? 'Print label' : '라벨 인쇄'}</button><a href={qr} download="artwork-qr.png">{en ? 'Download QR' : 'QR 저장'}</a></div>}{error && <p role="alert">{error}</p>}</div>;
}
