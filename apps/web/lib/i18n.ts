export type Lang = 'ar' | 'en';

export const dirOf = (lang: Lang): 'rtl' | 'ltr' => (lang === 'ar' ? 'rtl' : 'ltr');
export const parseLang = (v: string | undefined | null): Lang => (v === 'en' ? 'en' : 'ar');

/** Labels shared across the shell. Page-specific labels are passed as (ar, en) pairs. */
export const NAV_LABELS = {
  dashboard: ['لوحة التحكم', 'Dashboard'],
  sales: ['المبيعات', 'Sales'],
  purchases: ['المشتريات', 'Purchases'],
  customers: ['العملاء', 'Customers'],
  suppliers: ['الموردون', 'Suppliers'],
  products: ['الأصناف', 'Products'],
  catalog: ['الوحدات والتصنيفات', 'Units & categories'],
  warehouses: ['المخازن', 'Warehouses'],
  inventory: ['المخزون', 'Inventory'],
  representatives: ['المناديب', 'Representatives'],
  vehicles: ['السيارات', 'Vehicles'],
  routes: ['خطوط السير', 'Routes'],
  treasury: ['الخزينة والبنوك', 'Treasury'],
  accounting: ['المحاسبة', 'Accounting'],
  accounts: ['شجرة الحسابات', 'Chart of accounts'],
  journal: ['القيود اليومية', 'Journal entries'],
  ledger: ['ميزان المراجعة والأستاذ', 'Trial balance & ledger'],
  reports: ['التقارير', 'Reports'],
  hr: ['الموارد البشرية', 'Human resources'],
  admin: ['الإدارة والصلاحيات', 'Administration'],
  audit: ['سجل الرقابة', 'Audit log'],
} as const;

export type NavKey = keyof typeof NAV_LABELS;
