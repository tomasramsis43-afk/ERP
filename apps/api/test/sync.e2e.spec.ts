import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const today = new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);
const n = (v: string | number) => Number(v);

d('offline synchronisation (requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let token: string;
  let otherToken: string;
  let repId: string;
  let vanId: string;
  let mainId: string;
  let productId: string;
  let customerId: string;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const push = (operations: object[], t = token, deviceId = 'device-1') => http.post('/sync/push').set(bearer(t)).send({ deviceId, operations });
  const at = (offsetSec: number) => new Date(Date.now() - 60_000 + offsetSec * 1000).toISOString();
  const sale = (over: Record<string, unknown> = {}) => ({
    opId: randomUUID(),
    type: 'SALE',
    clientCreatedAt: at(0),
    payload: { invoiceDate: today, paymentKind: 'CASH', lines: [{ productId, quantity: '2' }] },
    ...over,
  });
  async function tb(code: string): Promise<number> {
    const r = await http.get('/accounting/reports/trial-balance').set(bearer(admin)).expect(200);
    const row = r.body.rows.find((x: { code: string }) => x.code === code);
    return row ? n(row.closingDebit) - n(row.closingCredit) : 0;
  }
  const custody = async () => n((await http.get(`/representatives/${repId}`).set(bearer(admin)).expect(200)).body.custodyBalance);
  const vanQty = async () => {
    const r = await http.get(`/inventory/balances?warehouseId=${vanId}&productId=${productId}`).set(bearer(admin)).expect(200);
    return r.body.items.length ? n(r.body.items[0].quantity) : 0;
  };
  async function newRepUser() {
    const s = uid();
    const email = `rep-${s}@test.local`;
    const user = (await http.post('/users').set(bearer(admin)).send({ email, fullName: 'Rep', password: 'long-password-123', roleCodes: ['REPRESENTATIVE'] }).expect(201)).body;
    return { email, userId: user.id as string, s };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());
    admin = (await http.post('/auth/login').send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD }).expect(200)).body.accessToken;

    const s = uid();
    const unitId = (await http.post('/units').set(bearer(admin)).send({ code: `U-${s}`, nameAr: 'Ù‚Ø·Ø¹Ø©', nameEn: 'Piece' }).expect(201)).body.id;
    mainId = (await http.post('/warehouses').set(bearer(admin)).send({ code: `W-${s}`, nameAr: 'Ø±Ø¦ÙŠØ³ÙŠ', nameEn: 'Main', type: 'MAIN' }).expect(201)).body.id;
    productId = (await http.post('/products').set(bearer(admin)).send({ code: `P-${s}`, nameAr: 'ØµÙ†Ù', nameEn: 'Item', baseUnitId: unitId, retailPrice: '20', wholesalePrice: '15' }).expect(201)).body.id;
    const supplierId = (await http.post('/suppliers').set(bearer(admin)).send({ code: `S-${s}`, nameAr: 'Ù…ÙˆØ±Ø¯' }).expect(201)).body.id;
    await http.post('/purchases/invoices').set(bearer(admin)).send({ idempotencyKey: `pur-${s}`, invoiceDate: today, supplierId, warehouseId: mainId, paymentKind: 'CREDIT', lines: [{ productId, quantity: '500', unitPrice: '10' }] }).expect(201);
    const city = (await http.post('/geo-areas').set(bearer(admin)).send({ level: 'CITY', nameAr: 'Ù…Ø¯ÙŠÙ†Ø©', nameEn: `City ${s}` }).expect(201)).body;
    const routeId = (await http.post('/routes').set(bearer(admin)).send({ code: `RT-${s}`, nameAr: 'Ø®Ø·', nameEn: 'Route', geoAreaId: city.id }).expect(201)).body.id;
    customerId = (await http.post('/customers').set(bearer(admin)).send({ code: `C-${s}`, nameAr: 'Ø¹Ù…ÙŠÙ„', nameEn: 'Customer', creditLimit: '100000', routeId }).expect(201)).body.id;

    const u = await newRepUser();
    const vehicle = (await http.post('/vehicles').set(bearer(admin)).send({ plateNumber: `PL-${u.s}`, model: 'Van' }).expect(201)).body;
    vanId = vehicle.warehouseId;
    repId = (await http.post('/representatives').set(bearer(admin)).send({ code: `R${u.s}`.slice(0, 12), nameAr: 'Ù…Ù†Ø¯ÙˆØ¨', userId: u.userId, vehicleId: vehicle.id, routeId }).expect(201)).body.id;
    token = (await http.post('/auth/login').send({ email: u.email, password: 'long-password-123' }).expect(200)).body.accessToken;
    await http.post('/inventory/transfers').set(bearer(admin)).send({ date: today, fromWarehouseId: mainId, toWarehouseId: vanId, lines: [{ productId, quantity: '50' }] }).expect(201);

    // A second representative, to test isolation between users.
    const o = await newRepUser();
    const v2 = (await http.post('/vehicles').set(bearer(admin)).send({ plateNumber: `PL-${o.s}`, model: 'Van' }).expect(201)).body;
    await http.post('/representatives').set(bearer(admin)).send({ code: `R${o.s}`.slice(0, 12), nameAr: 'Ù…Ù†Ø¯ÙˆØ¨ Ù¢', userId: o.userId, vehicleId: v2.id }).expect(201);
    otherToken = (await http.post('/auth/login').send({ email: o.email, password: 'long-password-123' }).expect(200)).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('pull gives the representative everything needed offline', async () => {
    const r = (await http.get('/sync/pull').set(bearer(token)).expect(200)).body;
    expect(r.representative.id).toBe(repId);
    expect(r.representative.vanWarehouseId).toBe(vanId);
    expect(r.customers.some((c: { id: string }) => c.id === customerId)).toBe(true);
    const p = r.products.find((x: { id: string }) => x.id === productId);
    expect(n(p.retailPrice)).toBe(20);
    expect(n(r.vanStock.find((s: { productId: string }) => s.productId === productId).quantity)).toBe(50);
  });

  it('incremental pull returns only changed products, flags removed ones, and rejects a bad cursor', async () => {
    const full = (await http.get('/sync/pull').set(bearer(token)).expect(200)).body;
    expect(full.productsMode).toBe('FULL');
    const cursor = full.serverTime as string;

    // Nothing changed since the cursor (the 2-minute overlap is moved past by asking from the future).
    const later = new Date(Date.now() + 10 * 60_000).toISOString();
    const none = (await http.get(`/sync/pull?productsSince=${encodeURIComponent(later)}`).set(bearer(token)).expect(200)).body;
    expect(none.productsMode).toBe('DELTA');
    expect(none.products).toEqual([]);
    // Customers, prices and van stock are always complete.
    expect(none.customers.some((c: { id: string }) => c.id === customerId)).toBe(true);
    expect(n(none.vanStock.find((x: { productId: string }) => x.productId === productId).quantity)).toBeGreaterThanOrEqual(0);

    // A product edited after the cursor comes back; deactivating it flags it so the phone can drop it.
    await http.patch(`/products/${productId}`).set(bearer(admin)).send({ nameAr: 'ØµÙ†Ù Ù…Ø¹Ø¯Ù‘Ù„' }).expect(200);
    const changed = (await http.get(`/sync/pull?productsSince=${encodeURIComponent(cursor)}`).set(bearer(token)).expect(200)).body;
    const edited = changed.products.find((x: { id: string }) => x.id === productId);
    expect(edited.nameAr).toBe('ØµÙ†Ù Ù…Ø¹Ø¯Ù‘Ù„');
    expect(edited.isActive).toBe(true);
    await http.patch(`/products/${productId}`).set(bearer(admin)).send({ isActive: false }).expect(200);
    const removed = (await http.get(`/sync/pull?productsSince=${encodeURIComponent(cursor)}`).set(bearer(token)).expect(200)).body;
    expect(removed.products.find((x: { id: string }) => x.id === productId).isActive).toBe(false);
    await http.patch(`/products/${productId}`).set(bearer(admin)).send({ isActive: true }).expect(200);

    await http.get('/sync/pull?productsSince=not-a-date').set(bearer(token)).expect(400);
  });

  it('applies a batch in creation order, and replaying the same batch changes nothing', async () => {
    const cash0 = await custody();
    const stock0 = await vanQty();
    const batch = [
      sale({ clientCreatedAt: at(1) }), // 2 Ã— 20 cash = 40
      sale({ clientCreatedAt: at(2), payload: { invoiceDate: today, paymentKind: 'CREDIT', customerId, lines: [{ productId, quantity: '3' }] } }), // 60 credit
      { opId: randomUUID(), type: 'COLLECTION', clientCreatedAt: at(3), payload: { customerId, amount: '25', date: today } },
    ];
    const first = (await push(batch).expect(200)).body.results;
    expect(first.map((x: { status: string }) => x.status)).toEqual(['APPLIED', 'APPLIED', 'APPLIED']);
    expect(await custody()).toBeCloseTo(cash0 + 40 + 25, 2);
    expect(await vanQty()).toBe(stock0 - 5);

    // The phone never got the answer and sends everything again, even twice in parallel.
    const [a, b] = await Promise.all([push(batch), push(batch)]);
    for (const res of [a, b]) {
      expect(res.body.results.map((x: { status: string }) => x.status)).toEqual(['DUPLICATE', 'DUPLICATE', 'DUPLICATE']);
      expect(res.body.results.map((x: { resultId: string }) => x.resultId)).toEqual(first.map((x: { resultId: string }) => x.resultId));
    }
    expect(await custody()).toBeCloseTo(cash0 + 65, 2);
    expect(await vanQty()).toBe(stock0 - 5);
  });

  it('concurrent first delivery of the same operation creates one document', async () => {
    const stock0 = await vanQty();
    const op = sale();
    const [a, b] = await Promise.all([push([op]), push([op])]);
    const statuses = [a.body.results[0].status, b.body.results[0].status];
    expect(statuses.every((s: string) => s === 'APPLIED' || s === 'DUPLICATE' || s === 'RETRY')).toBe(true);
    await push([op]); // settle any RETRY
    expect(await vanQty()).toBe(stock0 - 2);
  });

  it('the server decides the warehouse and representative; a tampered payload cannot sell from the main warehouse', async () => {
    const stock0 = await vanQty();
    const main0 = (await http.get(`/inventory/balances?warehouseId=${mainId}&productId=${productId}`).set(bearer(admin)).expect(200)).body.items[0].quantity;
    const r = (await push([sale({ payload: { invoiceDate: today, paymentKind: 'CASH', warehouseId: mainId, representativeId: randomUUID(), lines: [{ productId, quantity: '1' }] } })]).expect(200)).body.results[0];
    // The forged warehouse and representative are overwritten with the server's own values.
    expect(r.status).toBe('APPLIED');
    expect(await vanQty()).toBe(stock0 - 1);
    const main1 = (await http.get(`/inventory/balances?warehouseId=${mainId}&productId=${productId}`).set(bearer(admin)).expect(200)).body.items[0].quantity;
    expect(n(main1)).toBe(n(main0));
  });

  it('a business failure is rejected once, kept, and never retried into success', async () => {
    const op = sale({ payload: { invoiceDate: today, paymentKind: 'CASH', lines: [{ productId, quantity: '100000' }] } });
    const r1 = (await push([op]).expect(200)).body.results[0];
    expect(r1.status).toBe('REJECTED');
    expect(r1.error).toBeTruthy();
    // Stock arrives afterwards; the old operation stays rejected, the device must create a new one.
    await http.post('/inventory/transfers').set(bearer(admin)).send({ date: today, fromWarehouseId: mainId, toWarehouseId: vanId, lines: [{ productId, quantity: '10' }] }).expect(201);
    const r2 = (await push([op]).expect(200)).body.results[0];
    expect(r2).toMatchObject({ status: 'REJECTED', error: r1.error });
  });

  it('one bad operation does not block the others in the batch', async () => {
    const bad = sale({ clientCreatedAt: at(10), payload: { invoiceDate: today, paymentKind: 'CASH', lines: [{ productId, quantity: '999999' }] } });
    const good = sale({ clientCreatedAt: at(11) });
    const res = (await push([bad, good]).expect(200)).body.results;
    expect(res.map((x: { status: string }) => x.status)).toEqual(['REJECTED', 'APPLIED']);
  });

  it("an operation id cannot be reused by another representative; users without a profile are refused", async () => {
    const op = sale();
    expect((await push([op]).expect(200)).body.results[0].status).toBe('APPLIED');
    const stolen = (await push([op], otherToken, 'device-2').expect(200)).body.results[0];
    expect(stolen.status).toBe('REJECTED');
    await push([sale()], admin).expect(404); // the admin has no representative profile
    await http.get('/sync/pull').set(bearer(admin)).expect(404);
  });

  it('validates the batch envelope', async () => {
    await http.post('/sync/push').set(bearer(token)).send({ deviceId: 'd', operations: [] }).expect(400);
    await http.post('/sync/push').set(bearer(token)).send({ deviceId: 'd', operations: [{ opId: 'not-a-uuid', type: 'SALE', clientCreatedAt: at(0), payload: {} }] }).expect(400);
    await http.post('/sync/push').send({ deviceId: 'd', operations: [sale()] }).expect(401);
  });

  it('field operations: an expense is paid from the representative\'s own custody, once', async () => {
    const before = await custody();
    const op = { opId: randomUUID(), type: 'EXPENSE', clientCreatedAt: at(1), payload: { category: 'FUEL', date: today, amount: '5.00', description: 'diesel' } };
    const first = (await push([op]).expect(200)).body.results[0];
    expect(first.status).toBe('APPLIED');
    expect(await custody()).toBeCloseTo(before - 5, 2);
    const replay = (await push([op]).expect(200)).body.results[0];
    expect(replay.status).toBe('DUPLICATE');
    expect(await custody()).toBeCloseTo(before - 5, 2);
    // A tampered payload (another account, unknown field, bad category) is refused, never applied.
    const bad = (await push([{ opId: randomUUID(), type: 'EXPENSE', clientCreatedAt: at(2), payload: { category: 'FUEL', date: today, amount: '5.00', financialAccountId: randomUUID() } }]).expect(200)).body.results[0];
    expect(bad.status).toBe('REJECTED');
    const badCategory = (await push([{ opId: randomUUID(), type: 'EXPENSE', clientCreatedAt: at(3), payload: { category: 'WINE', date: today, amount: '5.00' } }]).expect(200)).body.results[0];
    expect(badCategory.status).toBe('REJECTED');
    expect(await custody()).toBeCloseTo(before - 5, 2);
  });

  it('field operations: a visit is recorded, re-logging the same day corrects it, and the pull lists it', async () => {
    const first = (await push([{ opId: randomUUID(), type: 'VISIT', clientCreatedAt: at(1), payload: { customerId, outcome: 'NO_ORDER', note: 'busy' } }]).expect(200)).body.results[0];
    expect(first.status).toBe('APPLIED');
    const second = (await push([{ opId: randomUUID(), type: 'VISIT', clientCreatedAt: at(2), payload: { customerId, outcome: 'SHOP_CLOSED' } }]).expect(200)).body.results[0];
    expect(second.status).toBe('APPLIED');
    expect(second.resultId).toBe(first.resultId); // same representative, customer and day: one visit row
    const pulled = (await http.get('/sync/pull').set(bearer(token)).expect(200)).body;
    const visit = pulled.visitsToday.filter((v: { customerId: string }) => v.customerId === customerId);
    expect(visit).toHaveLength(1);
    expect(visit[0].outcome).toBe('SHOP_CLOSED');
    const bad = (await push([{ opId: randomUUID(), type: 'VISIT', clientCreatedAt: at(3), payload: { customerId, outcome: 'MAYBE' } }]).expect(200)).body.results[0];
    expect(bad.status).toBe('REJECTED');
  });

  it('field operations: a new customer is created for this representative and route, once', async () => {
    const op = { opId: randomUUID(), type: 'CUSTOMER', clientCreatedAt: at(1), payload: { nameAr: 'Ø¹Ù…ÙŠÙ„ Ø¬Ø¯ÙŠØ¯', nameEn: 'New shop', phone: '01000000000', address: 'Main street' } };
    const first = (await push([op]).expect(200)).body.results[0];
    expect(first.status).toBe('APPLIED');
    const replay = (await push([op]).expect(200)).body.results[0];
    expect(replay.status).toBe('DUPLICATE');
    expect(replay.resultId).toBe(first.resultId);
    const pulled = (await http.get('/sync/pull').set(bearer(token)).expect(200)).body;
    const created = pulled.customers.find((c: { id: string }) => c.id === first.resultId);
    expect(created.nameAr).toBe('Ø¹Ù…ÙŠÙ„ Ø¬Ø¯ÙŠØ¯');
    expect(n(created.creditLimit)).toBe(0); // a phone cannot grant itself credit
    const bad = (await push([{ opId: randomUUID(), type: 'CUSTOMER', clientCreatedAt: at(2), payload: { nameAr: 'x', creditLimit: '999999' } }]).expect(200)).body.results[0];
    expect(bad.status).toBe('REJECTED');
  });

  it('statement and report are scoped to the signed-in representative', async () => {
    const st = (await http.get(`/sync/customers/${customerId}/statement`).set(bearer(token)).expect(200)).body;
    expect(st.customer.id).toBe(customerId);
    expect(Array.isArray(st.rows)).toBe(true);
    expect(st).toHaveProperty('closingBalance');
    // The second representative has no route and no assignment to this customer.
    await http.get(`/sync/customers/${customerId}/statement`).set(bearer(otherToken)).expect(403);
    await http.get('/sync/customers/not-a-uuid/statement').set(bearer(token)).expect(400);

    const r = (await http.get('/sync/me/report').set(bearer(token)).expect(200)).body;
    expect(r.sales.count).toBeGreaterThan(0);
    expect(n(r.sales.total)).toBeGreaterThan(0);
    expect(n(r.expenses.total)).toBeGreaterThanOrEqual(5);
    expect(r.visits).toHaveProperty('SHOP_CLOSED');
    await http.get('/sync/me/report?from=2026-12-31&to=2026-01-01').set(bearer(token)).expect(403);
    await http.get('/sync/me/report?from=2020-01-01&to=2026-01-01').set(bearer(token)).expect(403);
    await http.get('/sync/me/report?from=yesterday').set(bearer(token)).expect(400);
    // A user without a representative profile has nothing to report.
    await http.get('/sync/me/report').set(bearer(admin)).expect(404);
  });

  it('the books stay balanced after all of it', async () => {
    expect((await http.get('/accounting/reports/trial-balance').set(bearer(admin)).expect(200)).body.balanced).toBe(true);
    expect(await tb('41')).toBeLessThan(0); // sales are credit-natural
  });
});
