import { ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../database/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { RoutesService } from '../routes/routes.service';
import { SalesService } from '../sales/sales.service';
import { VouchersService } from '../treasury/vouchers.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { PushDto, SyncOperationDto } from './dto/sync.dto';
import { RepContext, SyncHandlers } from './sync-handlers';

export type OpOutcome =
  | { opId: string; status: 'APPLIED' | 'DUPLICATE'; resultId: string | null }
  | { opId: string; status: 'REJECTED'; error: string }
  | { opId: string; status: 'RETRY'; error: string };

@Injectable()
export class SyncService {
  private readonly handlers: SyncHandlers;

  constructor(
    private readonly prisma: PrismaService,
    sales: SalesService,
    vouchers: VouchersService,
    vehicles: VehiclesService,
    routes: RoutesService,
    parties: PartiesService,
  ) {
    this.handlers = new SyncHandlers(sales, vouchers, vehicles, routes, parties, prisma);
  }

  async repContext(userId: string): Promise<RepContext> {
    const rep = await this.prisma.representative.findUnique({ where: { userId }, include: { vehicle: true, financialAccount: true } });
    if (!rep) throw new NotFoundException('No representative profile is linked to this user');
    if (!rep.isActive) throw new ForbiddenException('Representative is inactive');
    if (!rep.vehicle) throw new ForbiddenException('The representative has no vehicle assigned');
    return { repId: rep.id, repCode: rep.code, routeId: rep.routeId, vehicleId: rep.vehicle.id, vanWarehouseId: rep.vehicle.warehouseId, custodyAccountId: rep.financialAccountId };
  }

  /**
   * Applies a batch of offline operations in the order the device created them.
   *  - APPLIED:   done now.
   *  - DUPLICATE: this opId was already applied (a retry); nothing happens again.
   *  - REJECTED:  a business rule refused it for good; the device must show it to the user, not retry.
   *  - RETRY:     a transient server error; the device sends the same operation again later.
   * Each operation succeeds or fails on its own, so one bad sale never blocks the others.
   */
  async push(dto: PushDto, user: AuthUser): Promise<{ results: OpOutcome[] }> {
    const rep = await this.repContext(user.id);
    const ordered = [...dto.operations].sort((a, b) => new Date(a.clientCreatedAt).getTime() - new Date(b.clientCreatedAt).getTime());
    const results = new Map<string, OpOutcome>();
    for (const op of ordered) results.set(op.opId, await this.applyOne(op, dto.deviceId, rep, user));
    // Report in the order the device sent them.
    return { results: dto.operations.map((o) => results.get(o.opId)!) };
  }

  private async applyOne(op: SyncOperationDto, deviceId: string, rep: RepContext, user: AuthUser): Promise<OpOutcome> {
    const seen = await this.prisma.syncOperation.findUnique({ where: { opId: op.opId } });
    if (seen) {
      if (seen.userId !== user.id) return { opId: op.opId, status: 'REJECTED', error: 'Operation id belongs to another user' };
      return seen.status === 'APPLIED'
        ? { opId: op.opId, status: 'DUPLICATE', resultId: seen.resultId }
        : { opId: op.opId, status: 'REJECTED', error: seen.error ?? 'Rejected' };
    }
    try {
      const resultId = await this.handlers.run(op.type, op.opId, op.payload, rep, user);
      await this.remember(op, deviceId, user.id, { status: 'APPLIED', resultId });
      return { opId: op.opId, status: 'APPLIED', resultId };
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() < 500) {
        const error = this.message(e);
        await this.remember(op, deviceId, user.id, { status: 'REJECTED', error });
        return { opId: op.opId, status: 'REJECTED', error };
      }
      return { opId: op.opId, status: 'RETRY', error: 'Temporary server error' };
    }
  }

  private message(e: HttpException): string {
    const r = e.getResponse();
    const m = typeof r === 'string' ? r : (r as { message?: string | string[] }).message;
    return Array.isArray(m) ? m.join('; ') : m ?? e.message;
  }

  private async remember(op: SyncOperationDto, deviceId: string, userId: string, outcome: { status: 'APPLIED'; resultId: string } | { status: 'REJECTED'; error: string }) {
    try {
      await this.prisma.syncOperation.create({
        data: {
          opId: op.opId,
          userId,
          deviceId,
          type: op.type,
          payload: op.payload as Prisma.InputJsonValue,
          clientCreatedAt: new Date(op.clientCreatedAt),
          ...outcome,
        },
      });
    } catch (e) {
      // A concurrent retry of the same operation recorded it first; that is fine.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
  }
}
