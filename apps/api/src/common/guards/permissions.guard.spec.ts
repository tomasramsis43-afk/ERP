import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/auth.decorators';
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

  it('allows when no permission metadata is set', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
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
