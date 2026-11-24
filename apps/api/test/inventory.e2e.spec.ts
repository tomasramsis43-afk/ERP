import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JournalPostingService } from '../src/modules/accounting/journal/journal-posting.service';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const today = new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);

d('catalog, inventory and parties (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let token: string;
  let pieceId: string;
  let cartonId: string;
  let mainId: string;
  let vanId: string;
  let productId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function qty(warehouseId: string): Promise<number> {
    const r = await http.get(`/inventory/balances?warehouseId=${warehouseId}&productId=${productId}`).set(auth()).expect(200);
    return r.body.items.length ? Number(r.body.items[0].quantity) : 0;
  }

  async function trialBalanceOf(code: string): Promise<number> {
    const r = await http.get('/accounting/reports/trial-balance').set(auth()).expect(200);
    const row = r.body.rows.find((x: { code: string }) => x.code === code);
    return row ? Number(row.closingDebit) - Number(row.closingCredit) : 0;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());

    token = (
      await http.post('/auth/login').send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD }).expect(200)
    ).body.accessToken;

    const s = uid();
    pieceId = (await http.post('/units').set(auth()).send({ code: `PC-${s}`, nameAr: 'قطعة', nameEn: 'Piece' }).expect(201)).body.id;
    cartonId = (await http.post('/units').set(auth()).send({ code: `CT-${s}`, nameAr: 'كرتونة', nameEn: 'Carton' }).expect(201)).body.id;
    mainId = (await http.post('/warehouses').set(auth()).send({ code: `M-${s}`, nameAr: 'الرئيسي', nameEn: 'Main', type: 'MAIN' }).expect(201)).body.id;
    vanId = (await http.post('/warehouses').set(auth()).send({ code: `V-${s}`, nameAr: 'سيارة', nameEn: 'Van', type: 'VEHICLE' }).expect(201)).body.id;
    // Carton = 12 boxes x 10 pieces = 120 base pieces.
    productId = (
      await http
        .post('/products')
        .set(auth())
        .send({
          code: `P-${s}`,
          nameAr: 'صنف',
          nameEn: 'Item',
          baseUnitId: pieceId,
          retailPrice: '10',
          units: [{ unitId: cartonId, factor: '120' }],
        })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects invalid unit factors and duplicate base unit', async () => {
    await http
      .post('/products')
      .set(auth())
      .send({ code: `X-${uid()}`, nameAr: 'x', nameEn: 'x', baseUnitId: pieceId, units: [{ unitId: cartonId, factor: '0' }] })
      .expect(400);
    await http
      .post('/products')
      .set(auth())
      .send({ code: `X-${uid()}`, nameAr: 'x', nameEn: 'x', baseUnitId: pieceId, units: [{ unitId: pieceId, factor: '2' }] })
      .expect(400);
  });

  it('converts carton quantities into exact base units and posts opening stock', async () => {
    const invBefore = await trialBalanceOf('13');
    await http
      .post('/inventory/opening-stock')
      .set(auth())
      .send({
        date: today,
        warehouseId: mainId,
        // 2 cartons at 1200 per carton => 240 pieces at 10 each = 2400.
        lines: [{ productId, quantity: '2', unitId: cartonId, unitCost: '1200' }],
      })
      .expect(201);
    expect(await qty(mainId)).toBe(240);
    expect(await trialBalanceOf('13')).toBeCloseTo(invBefore + 2400, 2);
    const p = await http.get(`/products/${productId}`).set(auth()).expect(200);
    expect(Number(p.body.avgCost)).toBeCloseTo(10, 4);
  });

  it('computes weighted average cost across purchases at different costs', async () => {
    await http
      .post('/inventory/opening-stock')
      .set(auth())
      .send({ date: today, warehouseId: mainId, lines: [{ productId, quantity: '240', unitCost: '14' }] })
      .expect(201);
    // (240*10 + 240*14) / 480 = 12
    const p = await http.get(`/products/${productId}`).set(auth()).expect(200);
    expect(Number(p.body.avgCost)).toBeCloseTo(12, 4);
    expect(await qty(mainId)).toBe(480);
  });

  it('loading a vehicle is a transfer: stock moves, inventory is reclassified, no sale or COGS', async () => {
    const [inv0, van0, sales0, cogs0] = await Promise.all(['13', '1402', '41', '51'].map(trialBalanceOf));
    await http
      .post('/inventory/transfers')
      .set(auth())
      .send({ date: today, fromWarehouseId: mainId, toWarehouseId: vanId, lines: [{ productId, quantity: '100' }] })
      .expect(201);
    expect(await qty(mainId)).toBe(380);
    expect(await qty(vanId)).toBe(100);
    expect(await trialBalanceOf('13')).toBeCloseTo(inv0 - 1200, 2);
    expect(await trialBalanceOf('1402')).toBeCloseTo(van0 + 1200, 2);
    expect(await trialBalanceOf('41')).toBeCloseTo(sales0, 2);
    expect(await trialBalanceOf('51')).toBeCloseTo(cogs0, 2);
  });

  it('refuses to move more than is on hand and leaves stock untouched', async () => {
    await http
      .post('/inventory/transfers')
      .set(auth())
      .send({ date: today, fromWarehouseId: vanId, toWarehouseId: mainId, lines: [{ productId, quantity: '100.0001' }] })
      .expect(400);
    expect(await qty(vanId)).toBe(100);
  });

  it('is idempotent: replaying a transfer with the same key moves stock once', async () => {
    const body = {
      date: today,
      fromWarehouseId: mainId,
      toWarehouseId: vanId,
      idempotencyKey: `replay-${uid()}`,
      lines: [{ productId, quantity: '10' }],
    };
    const a = await http.post('/inventory/transfers').set(auth()).send(body).expect(201);
    const b = await http.post('/inventory/transfers').set(auth()).send(body).expect(201);
    expect(a.body.id).toBe(b.body.id);
    expect(await qty(vanId)).toBe(110);
    expect(await qty(mainId)).toBe(370);
  });

  it('never oversells under concurrency (stock cannot go negative)', async () => {
    const before = await qty(vanId); // 110
    const attempts = Array.from({ length: 6 }, () =>
      http
        .post('/inventory/transfers')
        .set(auth())
        .send({ date: today, fromWarehouseId: vanId, toWarehouseId: mainId, lines: [{ productId, quantity: '30' }] }),
    );
    const results = await Promise.all(attempts);
    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBe(Math.floor(before / 30)); // 3 succeed, 3 are rejected
    expect(await qty(vanId)).toBe(before - ok * 30);
    expect(await qty(vanId)).toBeGreaterThanOrEqual(0);
  });

  it('adjustment requires a reason and posts to the adjustment account', async () => {
    await http
      .post('/inventory/adjustments')
      .set(auth())
      .send({ date: today, warehouseId: mainId, direction: 'OUT', reason: 'x', lines: [{ productId, quantity: '1' }] })
      .expect(400);
    const adj0 = await trialBalanceOf('60');
    await http
      .post('/inventory/adjustments')
      .set(auth())
      .send({ date: today, warehouseId: mainId, direction: 'OUT', reason: 'damaged goods', lines: [{ productId, quantity: '5' }] })
      .expect(201);
    expect(await trialBalanceOf('60')).toBeCloseTo(adj0 + 60, 2); // 5 pcs x avg 12
  });

  it('stock movement ledger is append-only', async () => {
    const m = await http.get(`/inventory/movements?productId=${productId}&pageSize=1`).set(auth()).expect(200);
    expect(m.body.items.length).toBe(1);
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    await expect(prisma.stockMovement.delete({ where: { id: m.body.items[0].id } })).rejects.toThrow(/append-only/);
    await prisma.$disconnect();
  });

  it('customer balance and aging come from posted party journal lines', async () => {
    const cust = await http
      .post('/customers')
      .set(auth())
      .send({ code: `C-${uid()}`, nameAr: 'عميل', creditLimit: '5000' })
      .expect(201);
    const accounts = await http.get('/accounting/accounts').set(auth()).expect(200);
    const ar = accounts.body.find((a: { code: string }) => a.code === '12').id;
    const cash = accounts.body.find((a: { code: string }) => a.code === '1101').id;
    const sales = accounts.body.find((a: { code: string }) => a.code === '41').id;
    const posting = app.get(JournalPostingService);
    const day = new Date(`${today}T00:00:00.000Z`);

    await posting.post({
      entryDate: day,
      description: 'credit sale',
      source: 'TEST',
      lines: [
        { accountId: ar, debit: '800.00', credit: 0, partyType: 'CUSTOMER', partyId: cust.body.id },
        { accountId: sales, debit: 0, credit: '800.00' },
      ],
    });
    await posting.post({
      entryDate: day,
      description: 'collection',
      source: 'TEST',
      lines: [
        { accountId: cash, debit: '300.00', credit: 0 },
        { accountId: ar, debit: 0, credit: '300.00', partyType: 'CUSTOMER', partyId: cust.body.id },
      ],
    });

    const got = await http.get(`/customers/${cust.body.id}`).set(auth()).expect(200);
    expect(got.body.balance).toBe('500.00');
    const st = await http.get(`/customers/${cust.body.id}/statement`).set(auth()).expect(200);
    expect(st.body.closingBalance).toBe('500.00');
    expect(st.body.rows).toHaveLength(2);
    const aging = await http.get(`/customers/${cust.body.id}/aging`).set(auth()).expect(200);
    expect(aging.body.total).toBe('500.00');
    expect(aging.body.unappliedCredit).toBe('0.00');
  });
});
