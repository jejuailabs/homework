export type ImportedCard = {front: string; back: string; example: string; alternatives: string[]};
export type CardImportResult = {cards: ImportedCard[]; errors: {line: number; reason: 'format' | 'empty' | 'length' | 'limit'}[]};

/** CSV/TSV with quoted delimiters, escaped quotes and multiline cells. */
export function parseCardImport(source: string): CardImportResult {
  const value = source.replace(/^\uFEFF/, '');
  if (value.length > 250_000) return {cards: [], errors: [{line: 1, reason: 'limit'}]};
  let delimiter = ',', headerQuoted = false, headerStarted = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '"') {if (headerQuoted && value[i + 1] === '"') i++; else headerQuoted = !headerQuoted; headerStarted = true;}
    else if (!headerQuoted && (char === '\r' || char === '\n')) {if (headerStarted) break;}
    else if (!headerQuoted && char === '\t') delimiter = '\t';
    else if (char.trim()) headerStarted = true;
  }
  const rows: {cells: string[]; line: number}[] = [];
  let cells: string[] = [], cell = '', quoted = false, closed = false, line = 1, start = 1;
  const fail = (): CardImportResult => ({cards: [], errors: [{line, reason: 'format'}]});
  for (let i = 0; i <= value.length; i++) {
    const char = value[i];
    if (quoted) {
      if (char === undefined) return fail();
      if (char === '"') {
        if (value[i + 1] === '"') {cell += '"'; i++;} else {quoted = false; closed = true;}
      } else {cell += char; if (char === '\n') line++;}
      continue;
    }
    if (char === delimiter) {cells.push(cell.trim()); cell = ''; closed = false;}
    else if (char === undefined || char === '\n' || char === '\r') {
      cells.push(cell.trim());
      if (cells.some(Boolean)) rows.push({cells, line: start});
      cells = []; cell = ''; closed = false;
      if (char === '\r' && value[i + 1] === '\n') i++;
      line++; start = line;
    } else if (char === '"') {
      if (closed || cell.trim()) return fail();
      cell = ''; quoted = true;
    } else if (closed && char.trim()) return fail();
    else cell += char;
  }
  if (rows[0] && /^(front|앞면|단어)$/i.test(rows[0].cells[0]) && /^(back|뒷면|뜻)$/i.test(rows[0].cells[1])) rows.shift();
  if (!rows.length) return {cards: [], errors: [{line: 1, reason: 'empty'}]};
  if (rows.length > 200) return {cards: [], errors: [{line: rows[200].line, reason: 'limit'}]};
  const result: CardImportResult = {cards: [], errors: []};
  for (const row of rows) {
    const [front, back, example = '', alternatives = ''] = row.cells;
    if (row.cells.length < 2 || row.cells.length > 4) {result.errors.push({line: row.line, reason: 'format'}); continue;}
    if (!front || !back) {result.errors.push({line: row.line, reason: 'empty'}); continue;}
    const accepted = alternatives.split('|').map(s => s.trim()).filter(Boolean);
    if (front.length > 500 || back.length > 500 || example.length > 1000 || accepted.length > 10 || accepted.some(s => s.length > 500)) {result.errors.push({line: row.line, reason: 'length'}); continue;}
    result.cards.push({front, back, example, alternatives: accepted});
  }
  return result;
}

export function cardsCsv(rows: string[][]) {
  const escape = (cell: string) => `"${(/^[\s]*[=+@\-]/.test(cell) ? `'${cell}` : cell).replaceAll('"', '""')}"`;
  return '\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n');
}
