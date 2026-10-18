'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Shell, X } from 'lucide-react';
import { spaceCatalog, type SpaceKind, type SpaceItem } from './catalog';
import { ItemArt } from './scene';
import { Clothes } from './buddy';
import { spaceRequest } from './client';
const categories: [
    SpaceKind,
    string
][] = [['pet', '동물 친구'], ['clothes', '옷과 가방'], ['furniture', '가구와 소품'], ['theme', '방 배경'], ['sticker', '다꾸 조각'], ['paper', '노트 배경']];
function Confirmation({ item, balance, onClose, onBuy, busy }: {
    item: SpaceItem;
    balance: number;
    onClose: () => void;
    onBuy: () => void;
    busy: boolean;
}) { const ref = useRef<HTMLDialogElement>(null); useEffect(() => { ref.current?.showModal(); }, []); return <dialog className="ms-confirm" ref={ref} onCancel={e => { e.preventDefault(); if (!busy)
    onClose(); }} aria-label="보말로 구매하기"><button className="ms-close" disabled={busy} onClick={onClose} aria-label="구매 창 닫기"><X size={18}/></button><div className="ms-confirm-art">{item.kind === 'clothes' ? <Clothes id={item.id}/> : <ItemArt id={item.id}/>}</div><h2>{item.name}</h2><p><Shell size={17}/>{item.price} 보말로 {item.kind === 'pet' ? '새 친구를 맞이할까요?' : '내 보관함에 담을까요?'}</p><p>구매 후 {balance - item.price} 보말이 남아요.</p><small>한 번 구매하면 반복해서 사용할 수 있어요.</small><div className="ms-actions"><button disabled={busy} onClick={onClose}>다음에</button><button className="ms-primary" disabled={busy || balance < item.price} onClick={onBuy}>{busy ? '친구가 담는 중…' : '보말로 구매하기'}</button></div></dialog>; }
export default function SpaceShop({ owned, balance, enabled, onBought, inventory = false }: {
    owned: string[];
    balance: number;
    enabled: boolean;
    onBought: () => Promise<void>;
    inventory?: boolean;
}) {
    const [kind, setKind] = useState<SpaceKind>('pet'), [preview, setPreview] = useState<SpaceItem | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), receipt = useRef({ item: '', request: '' });
    const items = spaceCatalog.filter(i => i.kind === kind && (!inventory || owned.includes(i.id)));
    async function buy() { if (!preview || busy)
        return; setBusy(true); setError(''); if (receipt.current.item !== preview.id)
        receipt.current = { item: preview.id, request: crypto.randomUUID() }; try {
        await spaceRequest('/purchase', 'POST', { itemId: preview.id, requestId: receipt.current.request });
        await onBought();
        setNotice(preview.kind === 'pet' ? '새 친구가 우리 집에 왔어요! 내 친구에서 만나 봐요.' : '보관함에 담았어요! 마음껏 꾸며 봐요.');
        receipt.current = { item: '', request: '' };
        setPreview(null);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <section className="ms-shop"><div className="ms-section-intro"><h2>{inventory ? '차곡차곡 내 보관함' : '모아의 작은 상점'}</h2><p>{inventory ? '내가 모은 취향을 꺼내 봐요. 방·친구·다꾸 메뉴에서 사용할 수 있어요.' : '마음에 드는 것을 천천히 골라 봐요. 모든 구매는 보말로만 가능해요.'}</p></div><div className="ms-categories" role="tablist" aria-label="상점 종류">{categories.map(([id, name]) => <button key={id} type="button" role="tab" aria-selected={kind === id} onClick={() => setKind(id)}>{name}</button>)}</div>{notice && <p className="ms-notice" role="status">{notice}</p>}{error && <p className="ms-error" role="alert">{error}</p>}<div className="ms-product-grid">{items.map(i => { const has = owned.includes(i.id); return <article key={i.id} className={'ms-product kind-' + i.kind}><div className="ms-product-art">{i.kind === 'clothes' ? <Clothes id={i.id}/> : <ItemArt id={i.id}/>}</div><h3>{i.name}</h3><p>{has ? <><Check size={14}/>내 보관함에 있어요</> : <><Shell size={14}/>{i.price} 보말</>}</p><button type="button" disabled={has || !enabled || balance < i.price} onClick={() => setPreview(i)}>{has ? '함께하는 중' : balance < i.price ? '조금 더 모아요' : i.kind === 'pet' ? '친구 맞이하기' : '내 보관함에 담기'}</button></article>; })}</div>{!items.length && <p className="ms-empty">여기는 아직 비어 있어요. 상점에서 마음에 드는 조각을 만나 봐요.</p>}{preview && <Confirmation item={preview} balance={balance} busy={busy} onClose={() => setPreview(null)} onBuy={() => void buy()}/>}</section>;
}
