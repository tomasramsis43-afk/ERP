import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const today = new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);

d('purchase orders (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let token: string;
  let supplierId: string;
  let otherSupplierId: string;
  let warehouseId: string;
  let productId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const stock = async () => {
    const r = await http.get(`/inventory/balances?warehouseId=${warehouseId}&productId=${productId}`).set(auth()).expect(200);
    return r.body.items.length ? Number(r.body.items[0].quantity) : 0;
  };
  const receive = (orderId: string | undefined, qty: string, extra: Record<string, unknown> = {}) =>
    http.post('/purchases/invoices').set(auth()).send({
      idempotencyKey: `po-${uid()}-${uid()}`, invoiceDate: today, supplierId, warehouseId, paymentKind: 'CREDIT',
      ...(orderId ? { purchaseOrderId: orderId } : {}), lines: [{ productId, quantity: qty, unitPrice: '5' }], ...extra,
    });
  const order = async () => (await http.post('/purchases/orders').set(auth()).send({
    orderDate: today, supplierId, warehouseId, lines: [{ productId, quantity: '10', unitPrice: '5' }],
  }).expect(201)).body;

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
    supplierId = (await http.post('/suppliers').set(auth()).send({ code: `S-${s}`, nameAr: 'مورد' }).expect(201)).body.id;
    otherSupplierId = (await http.post('/suppliers').set(auth()).send({ code: `T-${s}`, nameAr: 'مورد آخر' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creating an order moves no stock and no money', async () => {
    const before = await stock();
    const o = await order();
    expect(o.status).toBe('OPEN');
    expect(Number(o.subtotal)).toBe(50);
    expect(o.progress[0]).toMatchObject({ ordered: '10.0000', received: '0.0000', remaining: '10.0000' });
    expect(await stock()).toBe(before);
    expect((await http.get('/accounting/reports/trial-balance').set(auth()).expect(200)).body.balanced).toBe(true);
  });

  it('receives in parts, never over-receives, and counts stock once', async () => {
    const before = await stock();
    const o = await order();

    const first = (await receive(o.id, '4').expect(201)).body;
    expect(first.purchaseOrderId).toBe(o.id);
    expect(await stock()).toBe(before + 4);
    let cur = (await http.get(`/purchases/orders/${o.id}`).set(auth()).expect(200)).body;
    expect(cur.status).toBe('PARTIALLY_RECEIVED');
    expect(cur.progress[0]).toMatchObject({ received: '4.0000', remaining: '6.0000' });

    // More than what is outstanding is refused and changes nothing.
    await receive(o.id, '7').expect(400);
    expect(await stock()).toBe(before + 4);

    // Replaying the same receipt (same idempotency key) must not add stock again.
    const body = { idempotencyKey: `po-replay-${uid()}-${uid()}`, invoiceDate: today, supplierId, warehouseId, paymentKind: 'CREDIT', purchaseOrderId: o.id, lines: [{ productId, quantity: '6', unitPrice: '5' }] };
    await http.post('/purchases/invoices').set(auth()).send(body).expect(201);
    await http.post('/purchases/invoices').set(auth()).send(body).expect(201);
    expect(await stock()).toBe(before + 10);
    cur = (await http.get(`/purchases/orders/${o.id}`).set(auth()).expect(200)).body;
    expect(cur.status).toBe('RECEIVED');
    expect(cur.invoices).toHaveLength(2);

    // A fully received order cannot receive again nor be cancelled.
    await receive(o.id, '1').expect(409);
    await http.post(`/purchases/orders/${o.id}/cancel`).set(auth()).send({ reason: 'too late' }).expect(409);
    expect((await http.get('/accounting/reports/trial-balance').set(auth()).expect(200)).body.balanced).toBe(true);
  });

  it('cancelling a receipt reopens its quantity on the order', async () => {
    const o = await order();
    const inv = (await receive(o.id, '10').expect(201)).body;
    expect((await http.get(`/purchases/orders/${o.id}`).set(auth()).expect(200)).body.status).toBe('RECEIVED');
    await http.post(`/purchases/invoices/${inv.id}/cancel`).set(auth()).send({ reason: 'wrong delivery' }).expect(201);
    const cur = (await http.get(`/purchases/orders/${o.id}`).set(auth()).expect(200)).body;
    expect(cur.status).toBe('OPEN');
    expect(cur.progress[0]).toMatchObject({ received: '0.0000', remaining: '10.0000' });
  });

  it('rejects a receipt that does not match the order, and cancels an untouched order', async () => {
    const o = await order();
    await receive(o.id, '1', { supplierId: otherSupplierId }).expect(400);
    await receive(undefined, '1', { purchaseOrderId: '00000000-0000-4000-8000-000000000000' }).expect(400);
    const cancelled = (await http.post(`/purchases/orders/${o.id}/cancel`).set(auth()).send({ reason: 'not needed' }).expect(201)).body;
    expect(cancelled.status).toBe('CANCELLED');
    await receive(o.id, '1').expect(409);
    const list = (await http.get(`/purchases/orders?supplierId=${supplierId}&status=CANCELLED`).set(auth()).expect(200)).body;
    expect(list.total).toBeGreaterThanOrEqual(1);
  });
});
