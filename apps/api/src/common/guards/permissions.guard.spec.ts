import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATED_KEY, PERMISSIONS_KEY } from '../decorators/auth.decorators';
import { PermissionsGuard, hasAllPermissions } from './permissions.guard';

function ctx(user: unknown): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('hasAllPermissions requires every code', () => {
    expect(hasAllPermissions({ permissions: ['a:view', 'a:create'] }, ['a:view'])).toBe(true);
    expect(hasAllPermissions({ permissions: ['a:view'] }, ['a:view', 'a:create'])).toBe(false);
  });

  it('denies a route that has no access rule at all (deny by default)', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    expect(() => new PermissionsGuard(reflector).canActivate(ctx({ permissions: [] }))).toThrow(ForbiddenException);
  });

  it('allows a route explicitly marked for any authenticated user', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => key === AUTHENTICATED_KEY),
    } as unknown as Reflector;
    expect(new PermissionsGuard(reflector).canActivate(ctx({ permissions: [] }))).toBe(true);
  });

  it('denies a user lacking the permission', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => (key === PERMISSIONS_KEY ? ['sales:create'] : false)),
    } as unknown as Reflector;
    expect(() => new PermissionsGuard(reflector).canActivate(ctx({ permissions: ['sales:view'] }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows a user holding the permission', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => (key === PERMISSIONS_KEY ? ['sales:create'] : false)),
    } as unknown as Reflector;
    expect(new PermissionsGuard(reflector).canActivate(ctx({ permissions: ['sales:create'] }))).toBe(true);
  });
});
