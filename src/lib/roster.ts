export type RosterStudent = {number: number; name: string};
export type RosterIssue = {kind: 'empty' | 'format' | 'number' | 'name' | 'duplicate'; line: number};
export type RosterResult = {ok: true; students: RosterStudent[]} | {ok: false; issue: RosterIssue};

// Read a single CSV/TSV row without splitting a quoted name at its comma.
function cells(line: string, separator: string): string[] | null {
  const result: string[] = [];
  let value = '', quoted = false, closed = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (char !== '"') value += char;
      else if (line[index + 1] === '"') {value += '"'; index++;}
      else {quoted = false; closed = true;}
    } else if (char === separator) {
      result.push(value.trim()); value = ''; closed = false;
    } else if (char === '"' && !closed && !value.trim()) {
      value = ''; quoted = true;
    } else if (char === '"' || (closed && char.trim())) return null;
    else value += char;
  }
  if (quoted) return null;
  return [...result, value.trim()];
}

export function parseRoster(value: string): RosterResult {
  const students: RosterStudent[] = [];
  const numbers = new Set<number>();
  let firstRow = true;
  const rows = value.split(/\r\n|\n|\r/);
  for (let index = 0; index < rows.length; index++) {
    const line = rows[index].trim();
    if (!line) continue;
    const fail = (kind: RosterIssue['kind']): RosterResult => ({ok: false, issue: {kind, line: index + 1}});
    let pair: string[] | null;
    if (/^(?:"\d+"|\d+|"?(?:number|번호)"?)\s*,/i.test(line)) pair = cells(line, ',');
    else if (line.includes('\t') && !/^\d+\s*[.)번]/.test(line)) pair = cells(line, '\t');
    else {
      // A dot directly followed by a digit is a decimal, not a list marker.
      const match = line.match(/^(\d+)(?:\s*(?:\.(?!\d)|\)|번)\s*|\s+)(.*)$/);
      pair = match ? [match[1], match[2].trim()] : null;
    }
    if (firstRow && pair?.length === 2 && /^(number|번호)$/i.test(pair[0]) && /^(name|이름|성명)$/i.test(pair[1])) {firstRow = false; continue;}
    firstRow = false;
    if (!pair || pair.length !== 2) return fail('format');
    const [numberText, name] = pair;
    const number = Number(numberText);
    if (!/^\d+$/.test(numberText) || !Number.isInteger(number) || number < 1 || number > 999) return fail('number');
    if (!name || name.length > 50) return fail('name');
    if (numbers.has(number)) return fail('duplicate');
    numbers.add(number); students.push({number, name});
  }
  return students.length ? {ok: true, students} : {ok: false, issue: {kind: 'empty', line: 1}};
}
