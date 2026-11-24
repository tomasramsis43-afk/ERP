import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser, IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../decorators/auth.decorators';

/** Pure check, reused by tests and other services. */
export function hasAllPermissions(user: Pick<AuthUser, 'permissions'>, required: string[]): boolean {
  return required.every((code) => user.permissions.includes(code));
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user || !hasAllPermissions(user, required)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
