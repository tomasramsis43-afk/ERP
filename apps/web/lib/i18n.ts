export type Lang = 'ar' | 'en';

export const dict = {
  ar: {
    appName: 'نظام ERP', dashboard: 'لوحة التحكم', customers: 'العملاء', products: 'الأصناف', sales: 'المبيعات',
    reports: 'التقارير', representatives: 'المناديب', employees: 'الموظفون', logout: 'خروج', login: 'دخول',
    email: 'البريد الإلكتروني', password: 'كلمة المرور', loginFailed: 'بيانات الدخول غير صحيحة',
    salesToday: 'مبيعات اليوم', salesMonth: 'مبيعات الشهر', purchasesMonth: 'مشتريات الشهر', cashAndBanks: 'النقدية والبنوك',
    receivables: 'مستحقات العملاء', payables: 'مستحقات الموردين', inventoryValue: 'قيمة المخزون', lowStock: 'أصناف تحت حد الطلب',
    salesTrend: 'المبيعات آخر 14 يومًا', topCustomers: 'أفضل العملاء', topProducts: 'أفضل الأصناف',
    code: 'الكود', name: 'الاسم', phone: 'الهاتف', creditLimit: 'حد الائتمان', retailPrice: 'سعر التجزئة', wholesalePrice: 'سعر الجملة',
    number: 'الرقم', date: 'التاريخ', customer: 'العميل', kind: 'النوع', total: 'الإجمالي', status: 'الحالة',
    search: 'بحث', loading: 'جارٍ التحميل…', empty: 'لا توجد بيانات', error: 'حدث خطأ', previous: 'السابق', next: 'التالي',
    from: 'من', to: 'إلى', asOf: 'حتى تاريخ', run: 'عرض', exportExcel: 'تصدير Excel', exportPdf: 'تصدير PDF',
    incomeStatement: 'قائمة الدخل', balanceSheet: 'الميزانية العمومية', cashFlow: 'التدفقات النقدية', trialBalance: 'ميزان المراجعة',
    agingCustomers: 'أعمار ديون العملاء', agingSuppliers: 'أعمار ديون الموردين', revenue: 'الإيرادات', netProfit: 'صافي الربح',
    grossProfit: 'مجمل الربح', balanced: 'الميزانية متزنة', notBalanced: 'الميزانية غير متزنة', language: 'English', theme: 'المظهر',
    custody: 'العهدة', vehicle: 'السيارة', active: 'نشط', inactive: 'موقوف', jobTitle: 'الوظيفة', baseSalary: 'الراتب الأساسي',
    openingCash: 'رصيد أول المدة', closingCash: 'رصيد آخر المدة', source: 'المصدر', inflow: 'داخل', outflow: 'خارج', net: 'الصافي',
    current: 'جاري', over90: 'أكثر من 90', account: 'الحساب', amount: 'المبلغ',
  },
  en: {
    appName: 'ERP', dashboard: 'Dashboard', customers: 'Customers', products: 'Products', sales: 'Sales',
    reports: 'Reports', representatives: 'Representatives', employees: 'Employees', logout: 'Sign out', login: 'Sign in',
    email: 'Email', password: 'Password', loginFailed: 'Invalid email or password',
    salesToday: 'Sales today', salesMonth: 'Sales this month', purchasesMonth: 'Purchases this month', cashAndBanks: 'Cash and banks',
    receivables: 'Receivables', payables: 'Payables', inventoryValue: 'Inventory value', lowStock: 'Products below reorder level',
    salesTrend: 'Sales, last 14 days', topCustomers: 'Top customers', topProducts: 'Top products',
    code: 'Code', name: 'Name', phone: 'Phone', creditLimit: 'Credit limit', retailPrice: 'Retail price', wholesalePrice: 'Wholesale price',
    number: 'No.', date: 'Date', customer: 'Customer', kind: 'Type', total: 'Total', status: 'Status',
    search: 'Search', loading: 'Loading…', empty: 'No data', error: 'Something went wrong', previous: 'Previous', next: 'Next',
    from: 'From', to: 'To', asOf: 'As of', run: 'Show', exportExcel: 'Export Excel', exportPdf: 'Export PDF',
    incomeStatement: 'Income statement', balanceSheet: 'Balance sheet', cashFlow: 'Cash flow', trialBalance: 'Trial balance',
    agingCustomers: 'Customer aging', agingSuppliers: 'Supplier aging', revenue: 'Revenue', netProfit: 'Net profit',
    grossProfit: 'Gross profit', balanced: 'Balance sheet balances', notBalanced: 'Balance sheet does not balance', language: 'العربية', theme: 'Theme',
    custody: 'Custody', vehicle: 'Vehicle', active: 'Active', inactive: 'Inactive', jobTitle: 'Job title', baseSalary: 'Base salary',
    openingCash: 'Opening cash', closingCash: 'Closing cash', source: 'Source', inflow: 'Inflow', outflow: 'Outflow', net: 'Net',
    current: 'Current', over90: '90+', account: 'Account', amount: 'Amount',
  },
} as const;

export type Key = keyof (typeof dict)['en'];

export const dirOf = (lang: Lang): 'rtl' | 'ltr' => (lang === 'ar' ? 'rtl' : 'ltr');
export const parseLang = (v: string | undefined | null): Lang => (v === 'en' ? 'en' : 'ar');
export const translate = (lang: Lang, key: Key): string => dict[lang][key];
