import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from './decorators/auth.decorators';
import { assertOwnRep, repScope } from './rep-scope';

const user = (roles: string[], permissions: string[] = []): AuthUser => ({ id: 'u1', email: 'u@x', roles, permissions, branchId: null });
const prismaWith = (rep: unknown) => ({ representative: { findUnique: jest.fn().mockResolvedValue(rep) } }) as never;

describe('repScope', () => {
  it('restricts a representative to their own profile, route and van', async () => {
    const scope = await repScope(prismaWith({ id: 'r1', routeId: 'rt', vehicle: { warehouseId: 'w1' } }), user(['REPRESENTATIVE']));
    expect(scope).toEqual({ restricted: true, repId: 'r1', routeId: 'rt', warehouseId: 'w1' });
  });

  it('does not restrict managers or other roles, and does not query the database for them', async () => {
    const db = prismaWith(null);
    expect(await repScope(db, user(['SALES_MANAGER']))).toEqual({ restricted: false });
    expect(await repScope(db, user(['REPRESENTATIVE'], ['representatives:approve']))).toEqual({ restricted: false });
    expect((db as never as { representative: { findUnique: jest.Mock } }).representative.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a representative user that has no representative profile', async () => {
    await expect(repScope(prismaWith(null), user(['REPRESENTATIVE']))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assertOwnRep allows the owner and unrestricted users, rejects everyone else', () => {
    const scope = { restricted: true as const, repId: 'r1', routeId: null, warehouseId: null };
    expect(() => assertOwnRep(scope, 'r1')).not.toThrow();
    expect(() => assertOwnRep({ restricted: false }, 'other')).not.toThrow();
    expect(() => assertOwnRep(scope, 'r2')).toThrow(ForbiddenException);
    expect(() => assertOwnRep(scope, null)).toThrow(ForbiddenException);
  });
});
