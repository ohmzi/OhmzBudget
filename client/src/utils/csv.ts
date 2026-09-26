export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  return { headers, rows };
}

export function normalizeDate(raw: string): string {
  const trimmed = raw.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slash = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (slash) {
    const [, m, d, y] = slash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return trimmed;
}

export function generateImportId(date: string, amount: number, payeeName: string): string {
  return `${date}|${amount}|${(payeeName || '').toLowerCase()}`;
}

const COLUMN_HINTS: Record<string, string> = {
  date: 'date',
  'transaction date': 'date',
  'posted date': 'date',
  'post date': 'date',
  description: 'payee',
  payee: 'payee',
  name: 'payee',
  merchant: 'payee',
  amount: 'amount',
  'transaction amount': 'amount',
  debit: 'outflow',
  withdrawal: 'outflow',
  outflow: 'outflow',
  credit: 'inflow',
  deposit: 'inflow',
  inflow: 'inflow',
  memo: 'notes',
  notes: 'notes',
  note: 'notes',
  reference: 'notes',
};

export type ColumnRole = 'date' | 'payee' | 'amount' | 'inflow' | 'outflow' | 'notes' | 'skip';

export function guessColumnRoles(headers: string[]): ColumnRole[] {
  return headers.map((h) => (COLUMN_HINTS[h.toLowerCase()] as ColumnRole) ?? 'skip');
}
