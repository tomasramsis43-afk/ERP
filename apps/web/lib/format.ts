/** Amounts arrive from the API as exact decimal strings; format them without converting through floats. */
export function formatMoney(value: string | number | null | undefined, _lang: 'ar' | 'en' = 'ar'): string {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value);
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return s;
  const grouped = m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (m[3] ?? '').padEnd(2, '0').slice(0, 2);
  return `${m[1]}${grouped}.${frac}`;
}

/** Quantities keep up to 4 decimals but never show trailing zero noise. */
export function formatQty(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  const [i, f] = s.split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = f ? f.replace(/0+$/, '') : '';
  return frac ? `${grouped}.${frac}` : grouped;
}

export function formatNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const s = typeof value === 'string' ? value : value.toISOString();
  const d = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return s;
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const s = typeof value === 'string' ? value : value.toISOString();
  const date = formatDate(s);
  const t = s.length > 10 ? s.slice(11, 16) : '';
  return t ? `${date} ${t}` : date;
}

export const today = (): string => new Date().toISOString().slice(0, 10);
export const monthStart = (): string => `${today().slice(0, 7)}-01`;
export const yearStart = (): string => `${today().slice(0, 4)}-01-01`;
export const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function queryString(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function initials(name: string | undefined | null): string {
  if (!name) return '؟';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join('');
}
