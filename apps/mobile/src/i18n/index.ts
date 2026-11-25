import { I18nManager } from 'react-native';

export type Lang = 'ar' | 'en';

const dict = {
  ar: {
    appName: 'مندوب الميدان',
    email: 'البريد الإلكتروني', password: 'كلمة المرور', login: 'دخول', loginFailed: 'تعذر تسجيل الدخول',
    customers: 'العملاء', newSale: 'بيع جديد', collection: 'تحصيل', outbox: 'المزامنة', logout: 'خروج',
    sync: 'مزامنة الآن', syncing: 'جارٍ المزامنة…', lastSync: 'آخر مزامنة', never: 'لم تتم بعد',
    pending: 'بانتظار الإرسال', rejected: 'مرفوضة', nothingPending: 'لا توجد عمليات معلقة',
    cash: 'نقدي', credit: 'آجل', total: 'الإجمالي', save: 'حفظ', cancel: 'إلغاء', quantity: 'الكمية', amount: 'المبلغ',
    selectCustomer: 'اختر العميل', addProduct: 'إضافة صنف', custody: 'العهدة', balance: 'الرصيد', van: 'مخزن السيارة',
    savedOffline: 'تم الحفظ. سيُرسل عند توفر الإنترنت', insufficientStock: 'الكمية غير كافية في السيارة',
    creditLimit: 'حد الائتمان', language: 'English', reasonRejected: 'سبب الرفض', discard: 'حذف', retry: 'إعادة',
    estimate: 'تقدير: الخادم يحسب الإجمالي النهائي', search: 'بحث', noData: 'لا توجد بيانات، قم بالمزامنة أولًا',
  },
  en: {
    appName: 'Field Rep',
    email: 'Email', password: 'Password', login: 'Sign in', loginFailed: 'Sign-in failed',
    customers: 'Customers', newSale: 'New sale', collection: 'Collection', outbox: 'Sync', logout: 'Sign out',
    sync: 'Sync now', syncing: 'Syncing…', lastSync: 'Last sync', never: 'Never',
    pending: 'Waiting to send', rejected: 'Rejected', nothingPending: 'Nothing pending',
    cash: 'Cash', credit: 'Credit', total: 'Total', save: 'Save', cancel: 'Cancel', quantity: 'Quantity', amount: 'Amount',
    selectCustomer: 'Select customer', addProduct: 'Add product', custody: 'Custody', balance: 'Balance', van: 'Van stock',
    savedOffline: 'Saved. It will be sent when you are online', insufficientStock: 'Not enough stock on the van',
    creditLimit: 'Credit limit', language: 'العربية', reasonRejected: 'Rejection reason', discard: 'Discard', retry: 'Retry',
    estimate: 'Estimate: the server computes the final total', search: 'Search', noData: 'No data yet, sync first',
  },
} as const;

export type Key = keyof (typeof dict)['en'];

let current: Lang = 'ar';
export const getLang = (): Lang => current;
export const t = (k: Key): string => dict[current][k];

/** Switching direction needs an app reload on native; the caller prompts for it. */
export function setLang(lang: Lang): boolean {
  current = lang;
  const rtl = lang === 'ar';
  if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
    return true;
  }
  return false;
}

export const pick = (ar: string, en: string | null | undefined): string => (current === 'ar' ? ar : en || ar);
