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

d('representative data isolation (requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let token: string;
  let otherToken: string;
  let repId: string;
  let otherRepId: string;
  let vanId: string;
  let otherVanId: string;
  let mainId: string;
  let productId: string;
  let customerId: string;
  let otherCustomerId: string;
  let invoiceId: string;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const sale = (warehouseId: string, extra: Record<string, unknown> = {}) => ({
    idempotencyKey: `rs-${randomUUID()}`,
    invoiceDate: today,
    warehouseId,
    paymentKind: 'CASH',
    customerId,
    lines: [{ productId, quantity: '1' }],
    ...extra,
  });
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
    const unitId = (await http.post('/units').set(bearer(admin)).send({ code: `U-${s}`, nameAr: 'قطعة', nameEn: 'Piece' }).expect(201)).body.id;
    mainId = (await http.post('/warehouses').set(bearer(admin)).send({ code: `W-${s}`, nameAr: 'رئيسي', nameEn: 'Main', type: 'MAIN' }).expect(201)).body.id;
    productId = (await http.post('/products').set(bearer(admin)).send({ code: `P-${s}`, nameAr: 'صنف', nameEn: 'Item', baseUnitId: unitId, retailPrice: '20', wholesalePrice: '15' }).expect(201)).body.id;
    const supplierId = (await http.post('/suppliers').set(bearer(admin)).send({ code: `S-${s}`, nameAr: 'مورد' }).expect(201)).body.id;
    await http.post('/purchases/invoices').set(bearer(admin)).send({ idempotencyKey: `pur-${s}`, invoiceDate: today, supplierId, warehouseId: mainId, paymentKind: 'CREDIT', lines: [{ productId, quantity: '500', unitPrice: '10' }] }).expect(201);
    const city = (await http.post('/geo-areas').set(bearer(admin)).send({ level: 'CITY', nameAr: 'مدينة', nameEn: `City ${s}` }).expect(201)).body;
    const routeA = (await http.post('/routes').set(bearer(admin)).send({ code: `RA-${s}`, nameAr: 'خط', nameEn: 'Route A', geoAreaId: city.id }).expect(201)).body.id;
    const routeB = (await http.post('/routes').set(bearer(admin)).send({ code: `RB-${s}`, nameAr: 'خط', nameEn: 'Route B', geoAreaId: city.id }).expect(201)).body.id;
    customerId = (await http.post('/customers').set(bearer(admin)).send({ code: `C-${s}`, nameAr: 'عميل', nameEn: 'Mine', creditLimit: '100000', routeId: routeA }).expect(201)).body.id;
    otherCustomerId = (await http.post('/customers').set(bearer(admin)).send({ code: `D-${s}`, nameAr: 'عميل', nameEn: 'Theirs', creditLimit: '100000', routeId: routeB }).expect(201)).body.id;

    const a = await newRepUser();
    const va = (await http.post('/vehicles').set(bearer(admin)).send({ plateNumber: `PA-${a.s}`, model: 'Van' }).expect(201)).body;
    vanId = va.warehouseId;
    repId = (await http.post('/representatives').set(bearer(admin)).send({ code: `R${a.s}`.slice(0, 12), nameAr: 'مندوب', userId: a.userId, vehicleId: va.id, routeId: routeA }).expect(201)).body.id;
    token = (await http.post('/auth/login').send({ email: a.email, password: 'long-password-123' }).expect(200)).body.accessToken;
    await http.post('/inventory/transfers').set(bearer(admin)).send({ date: today, fromWarehouseId: mainId, toWarehouseId: vanId, lines: [{ productId, quantity: '50' }] }).expect(201);

    const b = await newRepUser();
    const vb = (await http.post('/vehicles').set(bearer(admin)).send({ plateNumber: `PB-${b.s}`, model: 'Van' }).expect(201)).body;
    otherVanId = vb.warehouseId;
    otherRepId = (await http.post('/representatives').set(bearer(admin)).send({ code: `R${b.s}`.slice(0, 12), nameAr: 'مندوب ٢', userId: b.userId, vehicleId: vb.id, routeId: routeB }).expect(201)).body.id;
    otherToken = (await http.post('/auth/login').send({ email: b.email, password: 'long-password-123' }).expect(200)).body.accessToken;
    await http.post('/inventory/transfers').set(bearer(admin)).send({ date: today, fromWarehouseId: mainId, toWarehouseId: otherVanId, lines: [{ productId, quantity: '50' }] }).expect(201);

    // The other representative's invoice: the one the first representative must not be able to read.
    invoiceId = (await http.post('/sales/invoices').set(bearer(otherToken)).send(sale(otherVanId, { customerId: otherCustomerId })).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('a representative cannot read another representative\'s invoice, profile, closings or commissions', async () => {
    await http.get(`/sales/invoices/${invoiceId}`).set(bearer(token)).expect(403);
    await http.get(`/representatives/${otherRepId}`).set(bearer(token)).expect(403);
    await http.get(`/representatives/${otherRepId}/closings`).set(bearer(token)).expect(403);
    await http.get(`/representatives/${otherRepId}/commissions`).set(bearer(token)).expect(403);
    await http.get(`/sales/invoices/${invoiceId}`).set(bearer(otherToken)).expect(200);
  });

  it('lists only the caller\'s own documents, representatives and customers', async () => {
    const mine = (await http.post('/sales/invoices').set(bearer(token)).send(sale(vanId)).expect(201)).body;
    const list = (await http.get('/sales/invoices').set(bearer(token)).expect(200)).body.items as { id: string; representativeId: string }[];
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((i) => i.representativeId === repId)).toBe(true);
    expect(list.some((i) => i.id === mine.id)).toBe(true);
    // Asking for someone else's documents through the filter changes nothing.
    const filtered = (await http.get(`/sales/invoices?representativeId=${otherRepId}`).set(bearer(token)).expect(200)).body.items as { representativeId: string }[];
    expect(filtered.every((i) => i.representativeId === repId)).toBe(true);

    const reps = (await http.get('/representatives').set(bearer(token)).expect(200)).body.items as { id: string }[];
    expect(reps.map((r) => r.id)).toEqual([repId]);

    const customers = (await http.get('/customers').set(bearer(token)).expect(200)).body.items as { id: string }[];
    expect(customers.some((c) => c.id === customerId)).toBe(true);
    expect(customers.some((c) => c.id === otherCustomerId)).toBe(false);
    await http.get(`/customers/${otherCustomerId}`).set(bearer(token)).expect(404);
    await http.get(`/customers/${customerId}`).set(bearer(token)).expect(200);
  });

  it('inventory balances are limited to the representative\'s own van', async () => {
    const own = (await http.get('/inventory/balances').set(bearer(token)).expect(200)).body.items as { warehouseId: string }[];
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((b) => b.warehouseId === vanId)).toBe(true);
    await http.get(`/inventory/balances?warehouseId=${mainId}`).set(bearer(token)).expect(403);
    await http.get(`/inventory/balances?warehouseId=${otherVanId}`).set(bearer(token)).expect(403);
  });

  it('a representative cannot sell from the main warehouse or on behalf of someone else', async () => {
    await http.post('/sales/invoices').set(bearer(token)).send(sale(mainId)).expect(400);
    await http.post('/sales/invoices').set(bearer(token)).send(sale(vanId, { representativeId: otherRepId })).expect(403);
    await http.post('/sales/invoices').set(bearer(token)).send(sale(otherVanId)).expect(400);
  });

  it('a stolen idempotency key does not reveal another representative\'s invoice', async () => {
    const key = `rs-${randomUUID()}`;
    await http.post('/sales/invoices').set(bearer(otherToken)).send(sale(otherVanId, { idempotencyKey: key, customerId: otherCustomerId })).expect(201);
    await http.post('/sales/invoices').set(bearer(token)).send(sale(vanId, { idempotencyKey: key })).expect(403);
  });

  it('the representative keeps their own closing preview, and managers still see everything', async () => {
    await http.get(`/representatives/${repId}/closing-preview?date=${today}`).set(bearer(token)).expect(200);
    await http.get(`/representatives/${otherRepId}/closing-preview?date=${today}`).set(bearer(token)).expect(403);
    await http.get(`/representatives/${repId}`).set(bearer(token)).expect(200);
    await http.get(`/sales/invoices/${invoiceId}`).set(bearer(admin)).expect(200);
    const all = (await http.get('/representatives').set(bearer(admin)).expect(200)).body.items as { id: string }[];
    expect(all.map((r) => r.id)).toEqual(expect.arrayContaining([repId, otherRepId]));
    const bal = (await http.get(`/inventory/balances?warehouseId=${mainId}`).set(bearer(admin)).expect(200)).body.items;
    expect(bal.length).toBeGreaterThan(0);
  });
});
