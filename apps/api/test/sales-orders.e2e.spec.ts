import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const today = new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);

d('quotations and sales orders (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let token: string;
  let customerId: string;
  let otherCustomerId: string;
  let warehouseId: string;
  let productId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const stock = async () => {
    const r = await http.get(`/inventory/balances?warehouseId=${warehouseId}&productId=${productId}`).set(auth()).expect(200);
    return r.body.items.length ? Number(r.body.items[0].quantity) : 0;
  };
  const balanced = async () => (await http.get('/accounting/reports/trial-balance').set(auth()).expect(200)).body.balanced === true;
  const newDoc = async (kind: 'QUOTATION' | 'ORDER', price = '15') => (await http.post('/sales/orders').set(auth()).send({
    kind, docDate: today, customerId, warehouseId, lines: [{ productId, quantity: '10', unitPrice: price }],
  }).expect(201)).body;
  const invoice = (orderId: string | undefined, qty: string, extra: Record<string, unknown> = {}) =>
    http.post('/sales/invoices').set(auth()).send({
      idempotencyKey: `so-${uid()}-${uid()}`, invoiceDate: today, paymentKind: 'CASH', customerId, warehouseId,
      ...(orderId ? { salesOrderId: orderId } : {}), lines: [{ productId, quantity: qty, unitPrice: '15' }], ...extra,
    });
  const get = async (id: string) => (await http.get(`/sales/orders/${id}`).set(auth()).expect(200)).body;

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
    customerId = (await http.post('/customers').set(auth()).send({ code: `C-${s}`, nameAr: 'عميل', creditLimit: '100000' }).expect(201)).body.id;
    otherCustomerId = (await http.post('/customers').set(auth()).send({ code: `D-${s}`, nameAr: 'عميل آخر', creditLimit: '100000' }).expect(201)).body.id;
    await http.post('/inventory/opening-stock').set(auth()).send({ date: today, warehouseId, lines: [{ productId, quantity: '100', unitCost: '4' }] }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('a quotation commits nothing and cannot be invoiced until confirmed', async () => {
    const before = await stock();
    const q = await newDoc('QUOTATION');
    expect(q.kind).toBe('QUOTATION');
    expect(Number(q.subtotal)).toBe(150);
    expect(await stock()).toBe(before);
    await invoice(q.id, '1').expect(409);

    const o = (await http.post(`/sales/orders/${q.id}/confirm`).set(auth()).expect(201)).body;
    expect(o.kind).toBe('ORDER');
    await http.post(`/sales/orders/${q.id}/confirm`).set(auth()).expect(409);
    expect(await balanced()).toBe(true);
  });

  it('invoices in parts at the agreed price, never over-invoices, replay is safe, stock leaves once', async () => {
    const before = await stock();
    const o = await newDoc('ORDER', '12'); // agreed price differs from the 10.00 list price
    const first = (await invoice(o.id, '4', { lines: [{ productId, quantity: '4', unitPrice: '12' }] }).expect(201)).body;
    expect(first.salesOrderId).toBe(o.id);
    expect(await stock()).toBe(before - 4);
    let cur = await get(o.id);
    expect(cur.status).toBe('PARTIALLY_INVOICED');
    expect(cur.progress[0]).toMatchObject({ invoiced: '4.0000', remaining: '6.0000' });

    await invoice(o.id, '7', { lines: [{ productId, quantity: '7', unitPrice: '12' }] }).expect(400);
    expect(await stock()).toBe(before - 4);

    const body = { idempotencyKey: `so-replay-${uid()}-${uid()}`, invoiceDate: today, paymentKind: 'CASH', customerId, warehouseId, salesOrderId: o.id, lines: [{ productId, quantity: '6', unitPrice: '12' }] };
    await http.post('/sales/invoices').set(auth()).send(body).expect(201);
    await http.post('/sales/invoices').set(auth()).send(body).expect(201);
    expect(await stock()).toBe(before - 10);
    cur = await get(o.id);
    expect(cur.status).toBe('INVOICED');
    expect(cur.invoices).toHaveLength(2);

    await invoice(o.id, '1', { lines: [{ productId, quantity: '1', unitPrice: '12' }] }).expect(409);
    await http.post(`/sales/orders/${o.id}/cancel`).set(auth()).send({ reason: 'too late' }).expect(409);
    expect(await balanced()).toBe(true);
  });

  it('cancelling an invoice reopens the order quantity', async () => {
    const o = await newDoc('ORDER');
    const inv = (await invoice(o.id, '10').expect(201)).body;
    expect((await get(o.id)).status).toBe('INVOICED');
    await http.post(`/sales/invoices/${inv.id}/cancel`).set(auth()).send({ reason: 'customer refused' }).expect(201);
    const cur = await get(o.id);
    expect(cur.status).toBe('OPEN');
    expect(cur.progress[0]).toMatchObject({ invoiced: '0.0000', remaining: '10.0000' });
  });

  it('rejects mismatching invoices, and cancels an untouched order', async () => {
    const o = await newDoc('ORDER');
    await invoice(o.id, '1', { customerId: otherCustomerId }).expect(400);
    await invoice(undefined, '1', { salesOrderId: '00000000-0000-4000-8000-000000000000' }).expect(400);
    const cancelled = (await http.post(`/sales/orders/${o.id}/cancel`).set(auth()).send({ reason: 'not needed' }).expect(201)).body;
    expect(cancelled.status).toBe('CANCELLED');
    await invoice(o.id, '1').expect(409);
    const list = (await http.get(`/sales/orders?customerId=${customerId}&status=CANCELLED`).set(auth()).expect(200)).body;
    expect(list.total).toBeGreaterThanOrEqual(1);
  });
});
