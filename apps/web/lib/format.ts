/** Amounts arrive from the API as exact decimal strings; format them without converting through floats for display grouping. */
export function formatMoney(value: string | number | null | undefined, lang: 'ar' | 'en' = 'en'): string {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value);
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return s;
  const grouped = m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (m[3] ?? '').padEnd(2, '0').slice(0, 2);
  const out = `${m[1]}${grouped}.${frac}`;
  return lang === 'ar' ? out.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]).replace(/,/g, '٬').replace('.', '٫') : out;
}

export const today = (): string => new Date().toISOString().slice(0, 10);
export const monthStart = (): string => `${today().slice(0, 7)}-01`;

export function queryString(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}
