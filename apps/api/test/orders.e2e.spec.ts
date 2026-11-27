import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const today = new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 12);

d('quotations, sales orders and purchase orders (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let rep: string;
  let accountant: string;
  let mainId: string;
  let productId: string;
  let supplierId: string;
  let customerId: string;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function login(email: string, password: string) {
    return (await http.post('/auth/login').send({ email, password }).expect(200)).body.accessToken as string;
  }
  async function userWithRole(role: string): Promise<string> {
    const email = `${role.toLowerCase()}-${uid()}@test.local`;
    await http.post('/users').set(bearer(admin)).send({ email, fullName: role, password: 'long-password-123', roleCodes: [role] }).expect(201);
    return login(email, 'long-password-123');
  }
  async function stock(): Promise<number> {
    const r = await http.get(`/inventory/balances?warehouseId=${mainId}&productId=${productId}`).set(bearer(admin)).expect(200);
    return r.body.items.length ? Number(r.body.items[0].quantity) : 0;
  }
  async function balanced(): Promise<boolean> {
    return (await http.get('/accounting/reports/trial-balance').set(bearer(admin)).expect(200)).body.balanced;
  }
  const customerBalance = async () => (await http.get(`/customers/${customerId}`).set(bearer(admin)).expect(200)).body.balance;

  const poBody = (qty: string) => ({
    docDate: today,
    supplierId,
    warehouseId: mainId,
    paymentKind: 'CREDIT',
    lines: [{ productId, quantity: qty, unitPrice: '10' }],
  });
  const quoteBody = (qty: string, kind = 'QUOTE', extra: Record<string, unknown> = {}) => ({
    kind,
    docDate: today,
    customerId,
    warehouseId: mainId,
    paymentKind: 'CREDIT',
    lines: [{ productId, quantity: qty }],
    ...extra,
  });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());

    admin = await login(process.env.SEED_ADMIN_EMAIL!, process.env.SEED_ADMIN_PASSWORD!);
    rep = await userWithRole('REPRESENTATIVE');
    accountant = await userWithRole('ACCOUNTANT');

    const s = uid();
    const unitId = (await http.post('/units').set(bearer(admin)).send({ code: `U-${s}`, nameAr: 'قطعة', nameEn: 'Piece' }).expect(201)).body.id;
    mainId = (await http.post('/warehouses').set(bearer(admin)).send({ code: `W-${s}`, nameAr: 'رئيسي', nameEn: 'Main', type: 'MAIN' }).expect(201)).body.id;
    productId = (
      await http
        .post('/products')
        .set(bearer(admin))
        .send({ code: `P-${s}`, nameAr: 'صنف', nameEn: 'Item', baseUnitId: unitId, retailPrice: '20', wholesalePrice: '15' })
        .expect(201)
    ).body.id;
    supplierId = (await http.post('/suppliers').set(bearer(admin)).send({ code: `S-${s}`, nameAr: 'مورد' }).expect(201)).body.id;
    customerId = (await http.post('/customers').set(bearer(admin)).send({ code: `C-${s}`, nameAr: 'عميل', creditLimit: '10000' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('purchase order: no stock effect until converted, then received exactly once', async () => {
    const before = await stock();
    const po = (await http.post('/purchase-orders').set(bearer(admin)).send(poBody('50')).expect(201)).body;
    expect(po.status).toBe('DRAFT');
    expect(Number(po.subtotal)).toBe(500);
    expect(await stock()).toBe(before);

    await http.post(`/purchase-orders/${po.id}/convert`).set(bearer(admin)).expect(409); // not confirmed yet
    await http.post(`/purchase-orders/${po.id}/confirm`).set(bearer(admin)).expect(201);
    expect(await stock()).toBe(before);

    const done = (await http.post(`/purchase-orders/${po.id}/convert`).set(bearer(admin)).expect(201)).body;
    expect(done.order.status).toBe('CONVERTED');
    expect(done.order.invoiceId).toBe(done.invoice.id);
    expect(await stock()).toBe(before + 50);

    await http.post(`/purchase-orders/${po.id}/convert`).set(bearer(admin)).expect(409);
    expect(await stock()).toBe(before + 50); // not received twice
    expect(await balanced()).toBe(true);
  });

  it('quotation: no stock or customer balance effect until converted, then one invoice', async () => {
    const stock0 = await stock();
    const bal0 = Number(await customerBalance());
    const q = (await http.post('/sales-orders').set(bearer(admin)).send(quoteBody('4')).expect(201)).body;
    expect(q.kind).toBe('QUOTE');
    expect(q.status).toBe('DRAFT');
    expect(Number(q.total)).toBe(80); // 4 x retail 20
    expect(await stock()).toBe(stock0);
    expect(Number(await customerBalance())).toBe(bal0);

    await http.post(`/sales-orders/${q.id}/convert`).set(bearer(admin)).expect(409); // must be confirmed first
    await http.post(`/sales-orders/${q.id}/confirm`).set(bearer(admin)).expect(201);
    await http.post(`/sales-orders/${q.id}/confirm`).set(bearer(admin)).expect(409); // not a draft anymore

    const done = (await http.post(`/sales-orders/${q.id}/convert`).set(bearer(admin)).expect(201)).body;
    expect(done.order.status).toBe('CONVERTED');
    expect(done.invoice.id).toBe(done.order.invoiceId);
    expect(await stock()).toBe(stock0 - 4);
    expect(Number(await customerBalance())).toBe(bal0 + 80);

    await http.post(`/sales-orders/${q.id}/convert`).set(bearer(admin)).expect(409);
    expect(await stock()).toBe(stock0 - 4); // no second invoice
    expect(await balanced()).toBe(true);
  });

  it('converting an order that exceeds stock is rejected and the order stays confirmed', async () => {
    const o = (await http.post('/sales-orders').set(bearer(admin)).send(quoteBody('999999', 'ORDER')).expect(201)).body;
    await http.post(`/sales-orders/${o.id}/confirm`).set(bearer(admin)).expect(201);
    await http.post(`/sales-orders/${o.id}/convert`).set(bearer(admin)).expect(400);
    const after = (await http.get(`/sales-orders/${o.id}`).set(bearer(admin)).expect(200)).body;
    expect(after.status).toBe('CONFIRMED');
    expect(after.invoiceId).toBeNull();
  });

  it('cancel works on open documents only and needs a reason', async () => {
    const o = (await http.post('/sales-orders').set(bearer(admin)).send(quoteBody('1')).expect(201)).body;
    await http.post(`/sales-orders/${o.id}/cancel`).set(bearer(admin)).send({}).expect(400);
    await http.post(`/sales-orders/${o.id}/cancel`).set(bearer(admin)).send({ reason: 'customer declined' }).expect(201);
    await http.post(`/sales-orders/${o.id}/confirm`).set(bearer(admin)).expect(409);
    await http.post(`/sales-orders/${o.id}/cancel`).set(bearer(admin)).send({ reason: 'again please' }).expect(409);
  });

  it('listing is paged and filterable by status', async () => {
    const r = await http.get('/sales-orders?status=CONVERTED&pageSize=5').set(bearer(admin)).expect(200);
    expect(r.body.items.length).toBeGreaterThan(0);
    expect(r.body.items.every((x: { status: string }) => x.status === 'CONVERTED')).toBe(true);
    const p = await http.get('/purchase-orders?status=CONVERTED').set(bearer(admin)).expect(200);
    expect(p.body.total).toBeGreaterThan(0);
  });

  it('permissions are enforced by the backend', async () => {
    // a representative may draft a quotation but not approve or cancel it
    const q = (await http.post('/sales-orders').set(bearer(rep)).send(quoteBody('1')).expect(201)).body;
    await http.post(`/sales-orders/${q.id}/confirm`).set(bearer(rep)).expect(403);
    await http.post(`/sales-orders/${q.id}/cancel`).set(bearer(rep)).send({ reason: 'not allowed' }).expect(403);
    // an accountant can read purchase orders but not create them
    await http.get('/purchase-orders').set(bearer(accountant)).expect(200);
    await http.post('/purchase-orders').set(bearer(accountant)).send(poBody('1')).expect(403);
    // discounts need sales:discount
    await http
      .post('/sales-orders')
      .set(bearer(rep))
      .send(quoteBody('2', 'QUOTE', { lines: [{ productId, quantity: '2', discount: '5' }] }))
      .expect(403);
  });
});
