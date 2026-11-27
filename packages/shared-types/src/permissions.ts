/**
 * Permission codes use the format `<resource>:<action>`.
 * Shared between API (enforcement) and web/mobile (UI visibility).
 */
export const RESOURCES = [
  'users',
  'roles',
  'accounting',
  'customers',
  'suppliers',
  'products',
  'inventory',
  'sales',
  'purchases',
  'treasury',
  'banks',
  'representatives',
  'vehicles',
  'routes',
  'hr',
  'reports',
  'settings',
  'audit',
] as const;

export const ACTIONS = [
  'view',
  'create',
  'update',
  'delete',
  'approve',
  'cancel',
] as const;

/** Special, sensitive permissions that are not plain CRUD. */
export const SPECIAL_PERMISSIONS = [
  'sales:discount',
  'sales:edit_price',
  'sales:credit_sale',
  'sales:override_credit_limit',
  'sales:approve_return',
  'sales:approve_discount',
  'accounting:adjust_balance',
  'reports:view_all',
  'routes:log_visit',
] as const;

export type Resource = (typeof RESOURCES)[number];
export type Action = (typeof ACTIONS)[number];
export type PermissionCode = `${Resource}:${Action}` | (typeof SPECIAL_PERMISSIONS)[number];

export function allPermissionCodes(): PermissionCode[] {
  const crud = RESOURCES.flatMap((r) => ACTIONS.map((a) => `${r}:${a}` as PermissionCode));
  return [...crud, ...SPECIAL_PERMISSIONS];
}

export const ROLE_CODES = [
  'SYSTEM_ADMIN',
  'GENERAL_MANAGER',
  'ACCOUNTANT',
  'WAREHOUSE_KEEPER',
  'SALES_MANAGER',
  'PURCHASING_MANAGER',
  'REPRESENTATIVE',
  'HR',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];
