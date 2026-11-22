import {zipParts} from '@/lib/zip-store';

/**
 * 최소한의 엑셀(.xlsx) 작성기. 브라우저와 서버 어디서나 같은 바이트를 만든다(외부 라이브러리 없음).
 * 문자열은 셀 안에 직접 넣고(inlineStr), 스타일은 머리글·부족(빨강)·초과(파랑)·증감 0·합계·제목·안내 몇 가지뿐이다.
 * 증감은 숫자로 넣고 서식(+0;-0;0)으로 부호를 보인다: 엑셀에서 더하고 정렬할 수 있게.
 */
export type CellStyle = 'head' | 'short' | 'over' | 'total' | 'title' | 'note' | 'even';
export type Cell = string | number | null | {value: string | number | null; style?: CellStyle};
export type Sheet = {name: string; rows: Cell[][]; widths?: number[]};

const STYLE_INDEX: Record<CellStyle, number> = {head: 1, short: 2, over: 3, total: 4, title: 5, note: 6, even: 7};
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const column = (index: number) => {let name = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name; return name;};
/** 시트 이름: 31자, 금지 문자 없이. */
export const sheetName = (name: string) => name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';

function sheetXml(sheet: Sheet) {
  const rows = sheet.rows.map((cells, r) => `<row r="${r + 1}">${cells.map((cell, c) => {
    const box = cell !== null && typeof cell === 'object' ? cell : {value: cell}, ref = `${column(c)}${r + 1}`, style = box.style ? ` s="${STYLE_INDEX[box.style]}"` : '';
    if (box.value === null || box.value === '') return box.style ? `<c r="${ref}"${style}/>` : '';
    return typeof box.value === 'number' ? `<c r="${ref}"${style}><v>${box.value}</v></c>` : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escape(box.value)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const cols = sheet.widths?.length ? `<cols>${sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="+0;-0;0"/></numFmts>`
  + `<fonts count="6"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><color rgb="FFC0392B"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><color rgb="FF2F6BB0"/><name val="맑은 고딕"/></font><font><b/><sz val="14"/><name val="맑은 고딕"/></font><font><sz val="10"/><color rgb="FF6B7C74"/><name val="맑은 고딕"/></font></fonts>`
  + `<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3F0E7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF6F8F5"/></patternFill></fill></fills>`
  + `<borders count="2"><border/><border><left style="thin"><color rgb="FFD5DED7"/></left><right style="thin"><color rgb="FFD5DED7"/></right><top style="thin"><color rgb="FFD5DED7"/></top><bottom style="thin"><color rgb="FFD5DED7"/></bottom></border></borders>`
  + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
  + `<xf xfId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`
  + `<xf xfId="0" numFmtId="164" fontId="2" borderId="1" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>`
  + `<xf xfId="0" numFmtId="164" fontId="3" borderId="1" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>`
  + `<xf xfId="0" fontId="1" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>`
  + `<xf xfId="0" fontId="4" applyFont="1"/><xf xfId="0" fontId="5" applyFont="1"/><xf xfId="0" numFmtId="164" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** 시트 여러 장을 .xlsx 바이트로. */
export function buildXlsx(sheets: Sheet[], created = new Date('2026-01-01T00:00:00Z')): Uint8Array {
  if (!sheets.length) throw new Error('시트가 없어요.');
  const encode = (text: string) => new TextEncoder().encode(text);
  const names = sheets.map(sheet => sheetName(sheet.name));
  const entries = [
    {name: '[Content_Types].xml', data: encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`)},
    {name: '_rels/.rels', data: encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`)},
    {name: 'xl/workbook.xml', data: encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, index) => `<sheet name="${escape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`)},
    {name: 'xl/_rels/workbook.xml.rels', data: encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)},
    {name: 'xl/styles.xml', data: encode(STYLES)},
    ...sheets.map((sheet, index) => ({name: `xl/worksheets/sheet${index + 1}.xml`, data: encode(sheetXml(sheet))})),
  ].map(entry => ({...entry, modifiedAt: created}));
  const parts = zipParts(entries), out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {out.set(part, offset); offset += part.length;}
  return out;
}
