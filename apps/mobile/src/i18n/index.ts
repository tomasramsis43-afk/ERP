import { I18nManager } from 'react-native';

export type Lang = 'ar' | 'en';

const dict = {
  ar: {
    appName: 'مندوب الميدان',
    server: 'عنوان الخادم', email: 'البريد الإلكتروني', password: 'كلمة المرور', login: 'دخول', loginFailed: 'تعذر تسجيل الدخول',
    customers: 'العملاء', newSale: 'بيع جديد', collection: 'تحصيل', outbox: 'المزامنة', logout: 'خروج',
    sync: 'مزامنة الآن', syncing: 'جارٍ المزامنة…', lastSync: 'آخر مزامنة', never: 'لم تتم بعد',
    pending: 'بانتظار الإرسال', rejected: 'مرفوضة', nothingPending: 'لا توجد عمليات معلقة',
    cash: 'نقدي', credit: 'آجل', total: 'الإجمالي', save: 'حفظ', cancel: 'إلغاء', quantity: 'الكمية', amount: 'المبلغ',
    selectCustomer: 'اختر العميل', addProduct: 'إضافة صنف', custody: 'العهدة', balance: 'الرصيد', van: 'مخزن السيارة',
    savedOffline: 'تم الحفظ. سيُرسل عند توفر الإنترنت', dbDamaged: 'قاعدة البيانات المحلية بها خلل. لا تحذف التطبيق، وأبلغ الدعم قبل أي إجراء', sessionExpired: 'انتهت الجلسة. سجّل الدخول مجدداً (عملياتك المحفوظة لم تُفقد)', saveFailed: 'تعذّر الحفظ. لم تُسجَّل العملية، حاول مرة أخرى', insufficientStock: 'الكمية غير كافية في السيارة',
    creditLimit: 'حد الائتمان', language: 'English', reasonRejected: 'سبب الرفض', discard: 'حذف', retry: 'إعادة',
    estimate: 'تقدير: الخادم يحسب الإجمالي النهائي', search: 'بحث', noResults: 'لا توجد نتائج', scan: 'مسح باركود', more: 'المزيد', stLocal: 'محفوظة، بانتظار الإرسال', stSyncing: 'جارٍ الإرسال', stRetry: 'ستُعاد المحاولة', stRejected: 'رفضها الخادم', confirmDiscard: 'حذف هذه العملية نهائياً؟ لن تُرسل للخادم', typeSALE: 'بيع', typeRETURN: 'مرتجع', typeCOLLECTION: 'تحصيل', pdf: 'PDF', pdfSummary: 'تصدير ملخص اليوم PDF', pdfFailed: 'تعذّر إنشاء ملف PDF', packUnit: 'وحدة تعبئة: كل وحدة =', cameraPermission: 'يلزم السماح باستخدام الكاميرا لمسح الباركود', allowCamera: 'السماح بالكاميرا', unknownBarcode: 'الباركود غير موجود في الأصناف', duplicateBarcode: 'الباركود مكرر على أكثر من صنف، اختر الصنف يدوياً', close: 'إغلاق', noData: 'لا توجد بيانات، قم بالمزامنة أولًا',
    closeDay: 'اليومية', preview: 'معاينة اليوم', expectedCash: 'النقدية المتوقعة', cashSales: 'مبيعات نقدية', creditSales: 'مبيعات آجلة', collections: 'التحصيلات',
    declaredCash: 'النقدية الفعلية', counted: 'المعدود', expected: 'المتوقع', difference: 'الفرق', differenceReason: 'سبب الفرق (إلزامي)', closeTheDay: 'إقفال اليوم',
    syncFirst: 'يوجد عمليات غير مرسلة. أرسلها من تبويب المزامنة قبل الإقفال.', dayClosed: 'تم إقفال اليوم', needOnline: 'يتطلب الإقفال اتصالاً بالخادم', fillAll: 'أدخل النقدية وعدّ كل الأصناف',
    returns: 'مرتجع', returnGood: 'سليم', returnDamaged: 'تالف', returnCredit: 'خصم من حساب العميل', returnCash: 'رد نقدي', vanStock: 'مخزون السيارة', daySummary: 'ملخص اليوم',
    cashRefunds: 'مرتجعات نقدية', returnsGood: 'مرتجعات سليمة', returnsDamaged: 'مرتجعات تالفة', operations: 'عدد العمليات', share: 'مشاركة الإيصال', receipt: 'إيصال', date: 'التاريخ', ref: 'مرجع',
    receiptCashSale: 'إيصال بيع نقدي', receiptCreditSale: 'إيصال بيع آجل', receiptReturnGood: 'إيصال مرتجع سليم', receiptReturnDamaged: 'إيصال مرتجع تالف', receiptCollection: 'إيصال تحصيل',
    returnNote: 'المرتجع يُخصم من حساب العميل والتالف لا يعود للمخزون', noOps: 'لا توجد عمليات اليوم', allSynced: 'كل العمليات أُرسلت', unsyncedOps: 'عمليات لم تُرسل بعد',
    offline: 'لا يوجد اتصال', offlineHint: 'تُحفظ العمليات محليًا وتُرسل عند عودة الاتصال',
  },
  en: {
    appName: 'Field Rep',
    server: 'Server address', email: 'Email', password: 'Password', login: 'Sign in', loginFailed: 'Sign-in failed',
    customers: 'Customers', newSale: 'New sale', collection: 'Collection', outbox: 'Sync', logout: 'Sign out',
    sync: 'Sync now', syncing: 'Syncing…', lastSync: 'Last sync', never: 'Never',
    pending: 'Waiting to send', rejected: 'Rejected', nothingPending: 'Nothing pending',
    cash: 'Cash', credit: 'Credit', total: 'Total', save: 'Save', cancel: 'Cancel', quantity: 'Quantity', amount: 'Amount',
    selectCustomer: 'Select customer', addProduct: 'Add product', custody: 'Custody', balance: 'Balance', van: 'Van stock',
    savedOffline: 'Saved. It will be sent when you are online', dbDamaged: 'The local database reports damage. Do not uninstall the app; contact support first', sessionExpired: 'Session expired. Please sign in again (your saved operations are kept)', saveFailed: 'Could not save. Nothing was recorded, please try again', insufficientStock: 'Not enough stock on the van',
    creditLimit: 'Credit limit', language: 'العربية', reasonRejected: 'Rejection reason', discard: 'Discard', retry: 'Retry',
    estimate: 'Estimate: the server computes the final total', search: 'Search', noResults: 'No results', scan: 'Scan barcode', more: 'More', stLocal: 'Saved, waiting to send', stSyncing: 'Sending', stRetry: 'Will retry', stRejected: 'Rejected by the server', confirmDiscard: 'Permanently delete this operation? It will not be sent to the server', typeSALE: 'Sale', typeRETURN: 'Return', typeCOLLECTION: 'Collection', pdf: 'PDF', pdfSummary: 'Export day summary as PDF', pdfFailed: 'Could not create the PDF', packUnit: 'Pack unit: each unit =', cameraPermission: 'Camera permission is needed to scan barcodes', allowCamera: 'Allow camera', unknownBarcode: 'This barcode is not in the catalogue', duplicateBarcode: 'This barcode belongs to more than one product, pick it manually', close: 'Close', noData: 'No data yet, sync first',
    closeDay: 'Close day', preview: 'Preview day', expectedCash: 'Expected cash', cashSales: 'Cash sales', creditSales: 'Credit sales', collections: 'Collections',
    declaredCash: 'Actual cash', counted: 'Counted', expected: 'Expected', difference: 'Difference', differenceReason: 'Reason for the difference (required)', closeTheDay: 'Close the day',
    syncFirst: 'Some operations are not sent yet. Send them from the Sync tab before closing.', dayClosed: 'Day closed', needOnline: 'Closing needs a connection to the server', fillAll: 'Enter the cash and count every product',
    returns: 'Return', returnGood: 'Good', returnDamaged: 'Damaged', returnCredit: 'Credit customer account', returnCash: 'Cash refund', vanStock: 'Van stock', daySummary: 'Day summary',
    cashRefunds: 'Cash refunds', returnsGood: 'Good returns', returnsDamaged: 'Damaged returns', operations: 'Operations', share: 'Share receipt', receipt: 'Receipt', date: 'Date', ref: 'Ref',
    receiptCashSale: 'Cash sale receipt', receiptCreditSale: 'Credit sale receipt', receiptReturnGood: 'Good return receipt', receiptReturnDamaged: 'Damaged return receipt', receiptCollection: 'Collection receipt',
    returnNote: 'The return is credited to the customer; damaged goods are not restocked', noOps: 'No operations today', allSynced: 'Everything is sent', unsyncedOps: 'Operations not sent yet',
    offline: 'Offline', offlineHint: 'Operations are saved locally and sent when you reconnect',
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
