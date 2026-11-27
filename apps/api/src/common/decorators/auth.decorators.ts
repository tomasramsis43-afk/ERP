import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSIONS_KEY = 'requiredPermissions';

/** Skips JWT authentication for a route. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Requires ALL listed permission codes (e.g. "sales:create"). */
export const RequirePermissions = (...codes: string[]) => SetMetadata(PERMISSIONS_KEY, codes);

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  /** The user's home branch; ignored for system-wide roles. */
  branchId: string | null;
}

/** System administrators and general managers always see every branch. */
export function branchScope(user: AuthUser): string | null {
  if (user.roles.includes('SYSTEM_ADMIN') || user.roles.includes('GENERAL_MANAGER')) return null;
  return user.branchId ?? null;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
