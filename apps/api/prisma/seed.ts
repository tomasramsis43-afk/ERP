import { allPermissionCodes, ROLE_CODES } from '@erp/shared-types';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CHART_OF_ACCOUNTS, ROLE_NAMES, ROLE_PERMISSIONS } from './seed-data';

const prisma = new PrismaClient();

async function applySqlFiles(): Promise<void> {
  for (const file of ['immutability.sql', 'constraints.sql']) {
    const sql = readFileSync(join(__dirname, 'sql', file), 'utf8');
    // Statements are separated by "-- @@" markers; each runs as its own command.
    const statements = sql
      .split('-- @@')
      .map((x) => x.trim())
      .filter((x) => /\S/.test(x.replace(/^--.*$/gm, '')));
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
  }
}

async function seedAccessControl(): Promise<void> {
  const codes = allPermissionCodes();
  for (const code of codes) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }
  const permissions = await prisma.permission.findMany();
  const byCode = new Map(permissions.map((p) => [p.code, p.id]));

  for (const roleCode of ROLE_CODES) {
    const names = ROLE_NAMES[roleCode];
    const role = await prisma.role.upsert({
      where: { code: roleCode },
      update: { nameAr: names.ar, nameEn: names.en },
      create: { code: roleCode, nameAr: names.ar, nameEn: names.en, isSystem: true },
    });
    const wanted = [...new Set(ROLE_PERMISSIONS[roleCode])].map((c) => byCode.get(c)!).filter(Boolean);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
    });
  }
}

async function seedAdmin(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.startsWith('CHANGE_ME')) {
    console.warn('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set to real values; skipping admin user.');
    return;
  }
  const role = await prisma.role.findUniqueOrThrow({ where: { code: 'SYSTEM_ADMIN' } });
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, fullName: 'System Administrator', passwordHash: await bcrypt.hash(password, 12) },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
}

async function seedCurrencyAndSettings(): Promise<void> {
  await prisma.currency.upsert({
    where: { code: 'EGP' },
    update: {},
    create: { code: 'EGP', nameAr: 'جنيه مصري', nameEn: 'Egyptian Pound', symbol: 'ج.م', decimals: 2, isBase: true },
  });
  const settings: Record<string, unknown> = {
    'vat.enabled': process.env.VAT_ENABLED === 'true',
    'vat.rate': process.env.VAT_RATE ?? '0.14',
    'inventory.valuationMethod': 'WEIGHTED_AVERAGE',
    'ui.defaultLocale': process.env.DEFAULT_LOCALE ?? 'ar',
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: value as never } });
  }
}

async function seedChartOfAccounts(): Promise<void> {
  const ids = new Map<string, string>();
  for (const a of CHART_OF_ACCOUNTS) {
    const normalBalance = a.type === 'ASSET' || a.type === 'EXPENSE' ? 'DEBIT' : 'CREDIT';
    const account = await prisma.account.upsert({
      where: { code: a.code },
      update: {},
      create: {
        code: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        type: a.type,
        normalBalance,
        isPostable: a.postable,
        parentId: a.parent ? ids.get(a.parent) : undefined,
      },
    });
    ids.set(a.code, account.id);
  }
}

async function seedFiscalPeriod(): Promise<void> {
  const year = new Date().getUTCFullYear();
  const startDate = new Date(Date.UTC(year, 0, 1));
  const endDate = new Date(Date.UTC(year, 11, 31));
  await prisma.fiscalPeriod.upsert({
    where: { startDate_endDate: { startDate, endDate } },
    update: {},
    create: { name: `FY ${year}`, startDate, endDate },
  });
}

async function main(): Promise<void> {
  await seedAccessControl();
  await seedAdmin();
  await seedCurrencyAndSettings();
  await seedChartOfAccounts();
  await seedFiscalPeriod();
  await applySqlFiles();
  console.log('Seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
