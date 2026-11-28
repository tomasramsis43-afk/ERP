import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSIONS_KEY = 'requiredPermissions';
export const AUTHENTICATED_KEY = 'anyAuthenticated';

/** Skips JWT authentication for a route. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Marks a route that any signed-in user may call (no specific permission). The permissions guard denies by default,
 * so a route without @Public, @RequirePermissions or this marker is rejected.
 */
export const AnyAuthenticated = () => SetMetadata(AUTHENTICATED_KEY, true);

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
