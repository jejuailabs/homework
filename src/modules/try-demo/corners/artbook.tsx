'use client';
import {useState} from 'react';
import {ArrowLeft, ArrowRight, BookOpen, Download, Users} from 'lucide-react';
import {DEMO_CLASS, demoAsset, works} from '../data';

// A real file made by the class artbook feature from the 25 sample works. Pages are shown as pictures.
const PAGES = 8;
const page = (n: number) => demoAsset(`artbook/page-${String(n).padStart(2, '0')}.webp`);
const pdf = demoAsset('artbook/class-artbook.pdf');
export default function ArtbookCorner() {
  const [n, setN] = useState(1);
  return <div className="try-artbook">
    <section className="try-card">
      <h2>한 해 작품을 한 권으로</h2>
      <p className="try-note">전시실에 걸린 작품 {works.length}점을 선생님이 버튼 몇 번으로 PDF로 엮은 결과예요. 표지와 차례가 들어가고, 그대로 인쇄할 수 있어요.</p>
      <div className="try-book" aria-roledescription="carousel" aria-label="작품집 미리보기">
        <button type="button" className="icon-button" aria-label="이전 쪽" disabled={n === 1} onClick={() => setN(n - 1)}><ArrowLeft size={20}/></button>
        <img key={n} src={page(n)} alt={`${DEMO_CLASS.name} 작품집 ${n}쪽`}/>
        <button type="button" className="icon-button" aria-label="다음 쪽" disabled={n === PAGES} onClick={() => setN(n + 1)}><ArrowRight size={20}/></button>
      </div>
      <p className="try-page-no" aria-live="polite">{n} / {PAGES}쪽 미리보기</p>
      <a className="button primary" href={pdf} target="_blank" rel="noopener"><Download size={17}/>샘플 PDF 전체 열기</a>
    </section>
    <section className="try-card try-ways">
      <h2>두 가지로 만들 수 있어요</h2>
      <ul>
        <li><Users size={20}/><div><strong>반 전체 한 권</strong><p>학급 문집처럼 우리 반 작품을 한 권에. 번호순·전시별·날짜순으로 엮고 이름은 가릴 수 있어요.</p></div></li>
        <li><BookOpen size={20}/><div><strong>학생별 한 권씩</strong><p>학생마다 자기 작품만 담은 책을 한 번에 만들어 묶음 파일로 받아요. 학기말에 가정으로 보내기 좋아요.</p></div></li>
      </ul>
      <p className="try-note">승인한 작품만 담기고, 선생님만 만들고 받을 수 있어요.</p>
    </section>
  </div>;
}
