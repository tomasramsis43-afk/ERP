import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const today = new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);

d('stock counts (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let token: string;
  let warehouseId: string;
  let productId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function qty(): Promise<number> {
    const r = await http.get(`/inventory/balances?warehouseId=${warehouseId}&productId=${productId}`).set(auth()).expect(200);
    return r.body.items.length ? Number(r.body.items[0].quantity) : 0;
  }
  async function trialBalanced(): Promise<boolean> {
    const r = await http.get('/accounting/reports/trial-balance').set(auth()).expect(200);
    return r.body.balanced === true;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());
    token = (await http.post('/auth/login').send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD }).expect(200)).body.accessToken;
    const s = uid();
    const unitId = (await http.post('/units').set(auth()).send({ code: `PC-${s}`, nameAr: 'قطعة', nameEn: 'Piece' }).expect(201)).body.id;
    warehouseId = (await http.post('/warehouses').set(auth()).send({ code: `M-${s}`, nameAr: 'الرئيسي', nameEn: 'Main', type: 'MAIN' }).expect(201)).body.id;
    productId = (await http.post('/products').set(auth()).send({ code: `P-${s}`, nameAr: 'صنف', nameEn: 'Item', baseUnitId: unitId, retailPrice: '10' }).expect(201)).body.id;
    await http.post('/inventory/opening-stock').set(auth()).send({ date: today, warehouseId, lines: [{ productId, quantity: '10', unitCost: '5' }] }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('counts, books a shortage on approval, and refuses a second approval', async () => {
    const c = (await http.post('/inventory/counts').set(auth()).send({ countDate: today, warehouseId }).expect(201)).body;
    expect(c.status).toBe('DRAFT');
    expect(c.lines).toHaveLength(1);
    expect(Number(c.lines[0].systemQty)).toBe(10);
    expect(c.lines[0].countedQty).toBeNull();

    // Only one open count per warehouse; invalid quantities are rejected.
    await http.post('/inventory/counts').set(auth()).send({ countDate: today, warehouseId }).expect(409);
    await http.put(`/inventory/counts/${c.id}/lines`).set(auth()).send({ lines: [{ productId, countedQty: '-1' }] }).expect(400);
    // Nothing counted yet: approval is refused and the count stays open.
    await http.post(`/inventory/counts/${c.id}/approve`).set(auth()).expect(400);
    expect((await http.get(`/inventory/counts/${c.id}`).set(auth()).expect(200)).body.status).toBe('DRAFT');

    await http.put(`/inventory/counts/${c.id}/lines`).set(auth()).send({ lines: [{ productId, countedQty: '8' }] }).expect(200);
    const ok = (await http.post(`/inventory/counts/${c.id}/approve`).set(auth()).expect(201)).body;
    expect(ok.status).toBe('APPROVED');
    expect(ok.result.adjusted).toBe(1);
    expect(ok.result.shortageValue).toBe('10.00'); // 2 units x 5.00
    expect(await qty()).toBe(8);
    expect(await trialBalanced()).toBe(true);

    await http.post(`/inventory/counts/${c.id}/approve`).set(auth()).expect(409);
    await http.put(`/inventory/counts/${c.id}/lines`).set(auth()).send({ lines: [{ productId, countedQty: '1' }] }).expect(409);
    expect(await qty()).toBe(8);
  });

  it('books a surplus, ignores uncounted lines, and can be cancelled', async () => {
    const c = (await http.post('/inventory/counts').set(auth()).send({ countDate: today, warehouseId }).expect(201)).body;
    await http.put(`/inventory/counts/${c.id}/lines`).set(auth()).send({ lines: [{ productId, countedQty: '12' }] }).expect(200);
    const ok = (await http.post(`/inventory/counts/${c.id}/approve`).set(auth()).expect(201)).body;
    expect(ok.result.surplusValue).toBe('20.00'); // 4 units x 5.00
    expect(await qty()).toBe(12);
    expect(await trialBalanced()).toBe(true);

    const c2 = (await http.post('/inventory/counts').set(auth()).send({ countDate: today, warehouseId }).expect(201)).body;
    const cancelled = (await http.post(`/inventory/counts/${c2.id}/cancel`).set(auth()).expect(201)).body;
    expect(cancelled.status).toBe('CANCELLED');
    await http.post(`/inventory/counts/${c2.id}/approve`).set(auth()).expect(409);
    expect(await qty()).toBe(12);

    const list = (await http.get(`/inventory/counts?warehouseId=${warehouseId}`).set(auth()).expect(200)).body;
    expect(list.total).toBe(3);
  });
});
