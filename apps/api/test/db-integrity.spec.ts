import { PrismaClient } from '@prisma/client';

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

d('database integrity (requires seeded PostgreSQL)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function periodId(): Promise<string> {
    const p = await prisma.fiscalPeriod.findFirstOrThrow();
    return p.id;
  }

  async function newEntry(status: 'DRAFT' | 'POSTED', key: string) {
    const [a, b] = await prisma.account.findMany({ where: { isPostable: true }, take: 2 });
    return prisma.journalEntry.create({
      data: {
        entryDate: new Date(),
        description: 'integrity test',
        status,
        idempotencyKey: key,
        periodId: await periodId(),
        lines: {
          create: [
            { accountId: a.id, debit: 10, credit: 0 },
            { accountId: b.id, debit: 0, credit: 10 },
          ],
        },
      },
      include: { lines: true },
    });
  }

  it('seeds the eight roles and EGP as base currency', async () => {
    expect(await prisma.role.count({ where: { isSystem: true } })).toBe(8);
    const egp = await prisma.currency.findUniqueOrThrow({ where: { code: 'EGP' } });
    expect(egp.isBase).toBe(true);
  });

  it('seeds the chart of accounts with natural balances', async () => {
    const cash = await prisma.account.findUniqueOrThrow({ where: { code: '1101' } });
    const sales = await prisma.account.findUniqueOrThrow({ where: { code: '41' } });
    expect(cash.normalBalance).toBe('DEBIT');
    expect(sales.normalBalance).toBe('CREDIT');
  });

  it('SYSTEM_ADMIN holds every permission; REPRESENTATIVE cannot delete', async () => {
    const total = await prisma.permission.count();
    const admin = await prisma.rolePermission.count({ where: { role: { code: 'SYSTEM_ADMIN' } } });
    expect(admin).toBe(total);
    const rep = await prisma.rolePermission.findMany({
      where: { role: { code: 'REPRESENTATIVE' } },
      include: { permission: true },
    });
    expect(rep.some((r) => r.permission.code.endsWith(':delete'))).toBe(false);
  });

  it('audit log rejects update and delete', async () => {
    const row = await prisma.auditLog.create({ data: { action: 'TEST', entity: 'Test' } });
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: 'X' } })).rejects.toThrow(
      /append-only/,
    );
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
  });

  it('draft entries are editable, posted entries are immutable', async () => {
    const stamp = Date.now().toString();
    const draft = await newEntry('DRAFT', `draft-${stamp}`);
    await prisma.journalEntry.update({ where: { id: draft.id }, data: { description: 'edited' } });

    await prisma.journalEntry.update({
      where: { id: draft.id },
      data: { status: 'POSTED', postedAt: new Date() },
    });
    await expect(
      prisma.journalEntry.update({ where: { id: draft.id }, data: { description: 'tamper' } }),
    ).rejects.toThrow(/cannot be modified/);
    await expect(prisma.journalEntry.delete({ where: { id: draft.id } })).rejects.toThrow(/cannot be deleted/);
    await expect(prisma.journalLine.delete({ where: { id: draft.lines[0].id } })).rejects.toThrow(/immutable/);
    await expect(
      prisma.journalLine.update({ where: { id: draft.lines[0].id }, data: { debit: 999 } }),
    ).rejects.toThrow(/immutable/);
  });

  it('idempotency key prevents a duplicate posting', async () => {
    const key = `dup-${Date.now()}`;
    await newEntry('DRAFT', key);
    await expect(newEntry('DRAFT', key)).rejects.toThrow(/Unique constraint/);
  });
});
