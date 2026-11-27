import { PermissionCode, RoleCode, allPermissionCodes } from '@erp/shared-types';

export const ROLE_NAMES: Record<RoleCode, { ar: string; en: string }> = {
  SYSTEM_ADMIN: { ar: 'مدير النظام', en: 'System Administrator' },
  GENERAL_MANAGER: { ar: 'المدير العام', en: 'General Manager' },
  ACCOUNTANT: { ar: 'المحاسب', en: 'Accountant' },
  WAREHOUSE_KEEPER: { ar: 'أمين المخزن', en: 'Warehouse Keeper' },
  SALES_MANAGER: { ar: 'مسؤول المبيعات', en: 'Sales Manager' },
  PURCHASING_MANAGER: { ar: 'مسؤول المشتريات', en: 'Purchasing Manager' },
  REPRESENTATIVE: { ar: 'المندوب', en: 'Sales Representative' },
  HR: { ar: 'الموارد البشرية', en: 'Human Resources' },
};

const crud = (resource: string, actions = ['view', 'create', 'update', 'delete']) =>
  actions.map((a) => `${resource}:${a}` as PermissionCode);

const all = allPermissionCodes();

export const ROLE_PERMISSIONS: Record<RoleCode, PermissionCode[]> = {
  SYSTEM_ADMIN: all,
  // General manager sees and approves everything but cannot manage users/roles destructively.
  GENERAL_MANAGER: all.filter((c) => !c.startsWith('users:delete') && !c.startsWith('roles:delete')),
  ACCOUNTANT: [
    ...crud('accounting', ['view', 'create', 'update', 'approve', 'cancel']),
    ...crud('treasury'),
    ...crud('banks'),
    ...crud('customers', ['view']),
    ...crud('suppliers', ['view']),
    ...crud('sales', ['view']),
    ...crud('purchases', ['view']),
    ...crud('reports', ['view']),
    'accounting:adjust_balance',
    'reports:view_all',
  ],
  WAREHOUSE_KEEPER: [
    ...crud('inventory', ['view', 'create', 'update', 'approve']),
    ...crud('products', ['view', 'create', 'update']),
    ...crud('purchases', ['view']),
    ...crud('reports', ['view']),
  ],
  SALES_MANAGER: [
    ...crud('sales', ['view', 'create', 'update', 'approve', 'cancel']),
    ...crud('customers'),
    ...crud('products', ['view']),
    ...crud('representatives', ['view', 'update', 'create', 'approve']),
    ...crud('vehicles'),
    ...crud('routes'),
    ...crud('reports', ['view']),
    'sales:discount',
    'sales:edit_price',
    'sales:credit_sale',
    'sales:approve_return',
  ],
  PURCHASING_MANAGER: [
    ...crud('purchases', ['view', 'create', 'update', 'approve', 'cancel']),
    ...crud('suppliers'),
    ...crud('products', ['view']),
    ...crud('inventory', ['view']),
    ...crud('reports', ['view']),
  ],
  REPRESENTATIVE: [
    ...crud('customers', ['view']),
    ...crud('representatives', ['view']),
    ...crud('routes', ['view']),
    'routes:log_visit',
    ...crud('products', ['view']),
    ...crud('sales', ['view', 'create']),
    ...crud('inventory', ['view']),
    'sales:credit_sale',
  ],
  HR: [...crud('hr', ['view', 'create', 'update', 'delete', 'approve']), ...crud('representatives', ['view']), ...crud('reports', ['view'])],
};

export interface SeedAccount {
  code: string;
  nameAr: string;
  nameEn: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  parent?: string;
  postable: boolean;
}

/** Default chart of accounts for a distribution company (editable after seeding). */
export const CHART_OF_ACCOUNTS: SeedAccount[] = [
  { code: '1', nameAr: 'الأصول', nameEn: 'Assets', type: 'ASSET', postable: false },
  { code: '11', nameAr: 'النقدية والبنوك', nameEn: 'Cash and Banks', type: 'ASSET', parent: '1', postable: false },
  { code: '1101', nameAr: 'الخزائن', nameEn: 'Cash Boxes', type: 'ASSET', parent: '11', postable: true },
  { code: '1102', nameAr: 'البنوك', nameEn: 'Banks', type: 'ASSET', parent: '11', postable: true },
  { code: '1103', nameAr: 'شيكات تحت التحصيل', nameEn: 'Cheques Under Collection', type: 'ASSET', parent: '11', postable: true },
  { code: '12', nameAr: 'العملاء', nameEn: 'Customers (Receivables)', type: 'ASSET', parent: '1', postable: true },
  { code: '13', nameAr: 'المخزون', nameEn: 'Inventory', type: 'ASSET', parent: '1', postable: true },
  { code: '14', nameAr: 'العهد', nameEn: 'Custodies', type: 'ASSET', parent: '1', postable: false },
  { code: '1401', nameAr: 'عهدة نقدية للمناديب', nameEn: 'Representative Cash Custody', type: 'ASSET', parent: '14', postable: true },
  { code: '1402', nameAr: 'مخزون السيارات', nameEn: 'Vehicle Stock', type: 'ASSET', parent: '14', postable: true },
  { code: '15', nameAr: 'الأصول الثابتة', nameEn: 'Fixed Assets', type: 'ASSET', parent: '1', postable: false },
  { code: '16', nameAr: 'ضريبة القيمة المضافة المدخلة', nameEn: 'VAT Receivable (Input)', type: 'ASSET', parent: '1', postable: true },
  { code: '17', nameAr: 'سلف الموظفين', nameEn: 'Employee Advances', type: 'ASSET', parent: '1', postable: true },
  { code: '1501', nameAr: 'السيارات', nameEn: 'Vehicles', type: 'ASSET', parent: '15', postable: true },
  { code: '1599', nameAr: 'مجمع الإهلاك', nameEn: 'Accumulated Depreciation', type: 'ASSET', parent: '15', postable: true },
  { code: '2', nameAr: 'الخصوم', nameEn: 'Liabilities', type: 'LIABILITY', postable: false },
  { code: '21', nameAr: 'الموردون', nameEn: 'Suppliers (Payables)', type: 'LIABILITY', parent: '2', postable: true },
  { code: '22', nameAr: 'القروض', nameEn: 'Loans', type: 'LIABILITY', parent: '2', postable: true },
  { code: '23', nameAr: 'مستحقات للغير', nameEn: 'Accrued Liabilities', type: 'LIABILITY', parent: '2', postable: true },
  { code: '24', nameAr: 'ضريبة القيمة المضافة', nameEn: 'VAT Payable', type: 'LIABILITY', parent: '2', postable: true },
  { code: '25', nameAr: 'شيكات تحت الدفع', nameEn: 'Cheques Payable', type: 'LIABILITY', parent: '2', postable: true },
  { code: '3', nameAr: 'حقوق الملكية', nameEn: 'Equity', type: 'EQUITY', postable: false },
  { code: '31', nameAr: 'رأس المال', nameEn: 'Capital', type: 'EQUITY', parent: '3', postable: true },
  { code: '32', nameAr: 'الأرباح المرحلة', nameEn: 'Retained Earnings', type: 'EQUITY', parent: '3', postable: true },
  { code: '33', nameAr: 'الأرباح والخسائر', nameEn: 'Profit and Loss', type: 'EQUITY', parent: '3', postable: true },
  { code: '4', nameAr: 'الإيرادات', nameEn: 'Revenue', type: 'REVENUE', postable: false },
  { code: '41', nameAr: 'المبيعات', nameEn: 'Sales', type: 'REVENUE', parent: '4', postable: true },
  { code: '42', nameAr: 'مردودات ومسموحات المبيعات', nameEn: 'Sales Returns and Allowances', type: 'REVENUE', parent: '4', postable: true },
  { code: '43', nameAr: 'خصم مكتسب', nameEn: 'Purchase Discounts Earned', type: 'REVENUE', parent: '4', postable: true },
  { code: '44', nameAr: 'إيرادات أخرى', nameEn: 'Other Income', type: 'REVENUE', parent: '4', postable: true },
  { code: '5', nameAr: 'المصروفات', nameEn: 'Expenses', type: 'EXPENSE', postable: false },
  { code: '51', nameAr: 'تكلفة البضاعة المباعة', nameEn: 'Cost of Goods Sold', type: 'EXPENSE', parent: '5', postable: true },
  { code: '52', nameAr: 'المرتبات', nameEn: 'Salaries', type: 'EXPENSE', parent: '5', postable: true },
  { code: '53', nameAr: 'عمولات المناديب', nameEn: 'Representative Commissions', type: 'EXPENSE', parent: '5', postable: true },
  { code: '54', nameAr: 'الوقود', nameEn: 'Fuel', type: 'EXPENSE', parent: '5', postable: true },
  { code: '55', nameAr: 'صيانة السيارات', nameEn: 'Vehicle Maintenance', type: 'EXPENSE', parent: '5', postable: true },
  { code: '56', nameAr: 'الإيجارات', nameEn: 'Rent', type: 'EXPENSE', parent: '5', postable: true },
  { code: '57', nameAr: 'مصروفات إدارية', nameEn: 'Administrative Expenses', type: 'EXPENSE', parent: '5', postable: true },
  { code: '58', nameAr: 'مصروفات تسويقية', nameEn: 'Marketing Expenses', type: 'EXPENSE', parent: '5', postable: true },
  { code: '59', nameAr: 'عجز وزيادة العهد', nameEn: 'Custody Shortage/Overage', type: 'EXPENSE', parent: '5', postable: true },
  { code: '60', nameAr: 'فروقات الجرد', nameEn: 'Inventory Adjustments', type: 'EXPENSE', parent: '5', postable: true },
  { code: '34', nameAr: 'أرصدة افتتاحية', nameEn: 'Opening Balance Equity', type: 'EQUITY', parent: '3', postable: true },
];
