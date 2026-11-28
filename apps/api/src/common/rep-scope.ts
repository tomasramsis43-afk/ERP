import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from './decorators/auth.decorators';

export type RepScope =
  | { restricted: false }
  | { restricted: true; repId: string; routeId: string | null; warehouseId: string | null };

type RepLookup = Pick<Prisma.TransactionClient, 'representative'>;

/**
 * A user with the REPRESENTATIVE role who cannot approve representatives' work sees only their own data
 * (their documents, customers, van and closings). Managers and every other role are unrestricted here;
 * their access is governed by permissions alone.
 */
export async function repScope(prisma: RepLookup, user: AuthUser): Promise<RepScope> {
  if (!user.roles.includes('REPRESENTATIVE') || user.permissions.includes('representatives:approve')) {
    return { restricted: false };
  }
  const rep = await prisma.representative.findUnique({
    where: { userId: user.id },
    select: { id: true, routeId: true, vehicle: { select: { warehouseId: true } } },
  });
  if (!rep) throw new ForbiddenException('No representative profile is linked to this user');
  return { restricted: true, repId: rep.id, routeId: rep.routeId, warehouseId: rep.vehicle?.warehouseId ?? null };
}

/** Throws unless the scope allows access to the given representative's data. */
export function assertOwnRep(scope: RepScope, repId: string | null | undefined): void {
  if (scope.restricted && scope.repId !== repId) throw new ForbiddenException('You can only access your own data');
}
