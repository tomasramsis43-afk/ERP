import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const today = new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 12);

d('sales and purchases full cycle (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let manager: string;
  let rep: string;
  let unitId: string;
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
  async function tb(code: string): Promise<number> {
    const r = await http.get('/accounting/reports/trial-balance').set(bearer(admin)).expect(200);
    const row = r.body.rows.find((x: { code: string }) => x.code === code);
    return row ? Number(row.closingDebit) - Number(row.closingCredit) : 0;
  }
  async function balanced(): Promise<boolean> {
    return (await http.get('/accounting/reports/trial-balance').set(bearer(admin)).expect(200)).body.balanced;
  }
  const customerBalance = async () => (await http.get(`/customers/${customerId}`).set(bearer(admin)).expect(200)).body.balance;
  const supplierBalance = async () => (await http.get(`/suppliers/${supplierId}`).set(bearer(admin)).expect(200)).body.balance;

  const saleBody = (qty: string, extra: Record<string, unknown> = {}) => ({
    idempotencyKey: `sale-${uid()}`,
    invoiceDate: today,
    paymentKind: 'CREDIT',
    customerId,
    warehouseId: mainId,
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
    manager = await userWithRole('SALES_MANAGER');
    rep = await userWithRole('REPRESENTATIVE');

    const s = uid();
    unitId = (await http.post('/units').set(bearer(admin)).send({ code: `U-${s}`, nameAr: 'قطعة', nameEn: 'Piece' }).expect(201)).body.id;
    mainId = (await http.post('/warehouses').set(bearer(admin)).send({ code: `W-${s}`, nameAr: 'رئيسي', nameEn: 'Main', type: 'MAIN' }).expect(201)).body.id;
    productId = (
      await http
        .post('/products')
        .set(bearer(admin))
        .send({ code: `P-${s}`, nameAr: 'صنف', nameEn: 'Item', baseUnitId: unitId, retailPrice: '20', wholesalePrice: '15' })
        .expect(201)
    ).body.id;
    supplierId = (await http.post('/suppliers').set(bearer(admin)).send({ code: `S-${s}`, nameAr: 'مورد' }).expect(201)).body.id;
    customerId = (await http.post('/customers').set(bearer(admin)).send({ code: `C-${s}`, nameAr: 'عميل', creditLimit: '1000' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  let purchaseId: string;
  it('purchase on credit: landed cost includes shipping, supplier owes the goods value', async () => {
    const inv0 = await tb('13');
    const cash0 = await tb('1101');
    const body = {
      idempotencyKey: `pur-${uid()}`,
      invoiceDate: today,
      supplierId,
      warehouseId: mainId,
      paymentKind: 'CREDIT',
      shippingCost: '100',
      lines: [{ productId, quantity: '100', unitPrice: '10' }],
    };
    const r = await http.post('/purchases/invoices').set(bearer(admin)).send(body).expect(201);
    purchaseId = r.body.id;
    expect(r.body.total).toBe('1000');
    expect(await stock()).toBe(100);
    expect(await supplierBalance()).toBe('1000.00');
    expect(await tb('13')).toBeCloseTo(inv0 + 1100, 2);
    expect(await tb('1101')).toBeCloseTo(cash0 - 100, 2);
    const p = await http.get(`/products/${productId}`).set(bearer(admin)).expect(200);
    expect(Number(p.body.avgCost)).toBeCloseTo(11, 4);

    // Replaying the same operation does not duplicate anything.
    const again = await http.post('/purchases/invoices').set(bearer(admin)).send(body).expect(201);
    expect(again.body.id).toBe(purchaseId);
    expect(await stock()).toBe(100);
    expect(await supplierBalance()).toBe('1000.00');
    expect(await balanced()).toBe(true);
  });

  it('concurrent duplicates of one operation create exactly one invoice', async () => {
    const body = saleBody('1');
    const results = await Promise.all(Array.from({ length: 5 }, () => http.post('/sales/invoices').set(bearer(admin)).send(body)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await stock()).toBe(99);
    // undo so later numbers stay simple
    await http.post(`/sales/invoices/${results[0].body.id}/cancel`).set(bearer(admin)).send({ reason: 'test cleanup' }).expect(201);
    expect(await stock()).toBe(100);
  });

  let saleId: string;
  it('credit sale: revenue, receivable and cost of goods are posted; stock drops', async () => {
    const [sales0, cogs0, inv0] = await Promise.all([tb('41'), tb('51'), tb('13')]);
    const r = await http.post('/sales/invoices').set(bearer(admin)).send(saleBody('10')).expect(201);
    saleId = r.body.id;
    expect(r.body.total).toBe('200');
    expect(r.body.costTotal).toBe('110');
    expect(await stock()).toBe(90);
    expect(await customerBalance()).toBe('200.00');
    expect(await tb('41')).toBeCloseTo(sales0 - 200, 2);
    expect(await tb('51')).toBeCloseTo(cogs0 + 110, 2);
    expect(await tb('13')).toBeCloseTo(inv0 - 110, 2);
    expect(await balanced()).toBe(true);
  });

  it('enforces the credit limit unless the user may override it', async () => {
    await http.post('/sales/invoices').set(bearer(manager)).send(saleBody('50')).expect(400); // 200 + 1000 > 1000
    await http.post('/sales/invoices').set(bearer(manager)).send(saleBody('10')).expect(201); // 200 + 200 <= 1000
    // An authorised override still needs a recorded reason.
    await http.post('/sales/invoices').set(bearer(admin)).send(saleBody('50')).expect(400);
    await http.post('/sales/invoices').set(bearer(admin)).send(saleBody('50', { creditOverrideReason: 'x' })).expect(400);
    const over = await http
      .post('/sales/invoices')
      .set(bearer(admin))
      .send(saleBody('50', { creditOverrideReason: 'Approved by the general manager' }))
      .expect(201);
    expect(over.body.total).toBe('1000');
    const audit = (await http.get('/audit-logs?entity=SalesInvoice&pageSize=100').set(bearer(admin)).expect(200)).body.items;
    const rec = audit.find((a: { action: string; entityId: string }) => a.action === 'CREDIT_LIMIT_OVERRIDE' && a.entityId === over.body.id);
    expect(rec).toBeTruthy();
    expect(rec.reason).toBe('Approved by the general manager');
    expect(rec.newData.creditLimit).toBe('1000');
    // A user without the permission cannot get around the limit by supplying a reason.
    await http.post('/sales/invoices').set(bearer(manager)).send(saleBody('50', { creditOverrideReason: 'please' })).expect(400);
    await http.post(`/sales/invoices/${over.body.id}/cancel`).set(bearer(admin)).send({ reason: 'cleanup' }).expect(201);
  });

  it('enforces discount and price permissions', async () => {
    const withDiscount = saleBody('1', { lines: [{ productId, quantity: '1', discount: '1' }] });
    await http.post('/sales/invoices').set(bearer(rep)).send({ ...withDiscount, paymentKind: 'CASH', customerId: undefined }).expect(403);
    const withPrice = saleBody('1', { lines: [{ productId, quantity: '1', unitPrice: '5' }] });
    await http.post('/sales/invoices').set(bearer(rep)).send({ ...withPrice, paymentKind: 'CASH', customerId: undefined }).expect(403);
    const ok = await http
      .post('/sales/invoices')
      .set(bearer(manager))
      .send(saleBody('1', { paymentKind: 'CASH', customerId: undefined, lines: [{ productId, quantity: '1', discount: '2' }] }))
      .expect(201);
    expect(ok.body.total).toBe('18');
  });

  it('refuses to sell more than the stock on hand', async () => {
    const before = await stock();
    await http.post('/sales/invoices').set(bearer(admin)).send(saleBody(String(before + 1), { paymentKind: 'CASH', customerId: undefined })).expect(400);
    expect(await stock()).toBe(before);
  });

  let returnId: string;
  it('return: restocks at the original cost, reduces the customer balance, caps by quantity sold', async () => {
    const balanceBefore = Number(await customerBalance());
    const stockBefore = await stock();
    const r = await http
      .post('/sales/returns')
      .set(bearer(admin))
      .send({ ...saleBody('4'), originalInvoiceId: saleId })
      .expect(201);
    returnId = r.body.id;
    expect(r.body.total).toBe('80');
    expect(await stock()).toBe(stockBefore + 4);
    expect(Number(await customerBalance())).toBeCloseTo(balanceBefore - 80, 2);
    // 4 already returned, only 6 left to return from the invoice of 10.
    await http.post('/sales/returns').set(bearer(admin)).send({ ...saleBody('7'), originalInvoiceId: saleId }).expect(400);
    expect(await balanced()).toBe(true);
  });

  it('damaged returns reduce the receivable but are not restocked', async () => {
    const stockBefore = await stock();
    const cogsBefore = await tb('51');
    await http
      .post('/sales/returns')
      .set(bearer(admin))
      .send({ ...saleBody('1'), originalInvoiceId: saleId, condition: 'DAMAGED' })
      .expect(201);
    expect(await stock()).toBe(stockBefore);
    expect(await tb('51')).toBeCloseTo(cogsBefore, 2); // cost stays expensed
  });

  it('cancellation reverses stock and accounting; a sale with a live return cannot be cancelled first', async () => {
    await http.post(`/sales/invoices/${saleId}/cancel`).set(bearer(admin)).send({ reason: 'customer cancelled' }).expect(409);
    const inv = await http.get(`/sales/invoices/${returnId}`).set(bearer(admin)).expect(200);
    expect(inv.body.status).toBe('POSTED');
    await http.post(`/sales/invoices/${returnId}/cancel`).set(bearer(admin)).send({ reason: 'mistake' }).expect(201);
    await http.post(`/sales/invoices/${returnId}/cancel`).set(bearer(admin)).send({ reason: 'again' }).expect(409);
    expect(await balanced()).toBe(true);
  });

  it('purchase return sends goods back at cost and reduces what is owed', async () => {
    const owed = Number(await supplierBalance());
    const before = await stock();
    await http
      .post('/purchases/returns')
      .set(bearer(admin))
      .send({
        idempotencyKey: `pret-${uid()}`,
        invoiceDate: today,
        supplierId,
        warehouseId: mainId,
        paymentKind: 'CREDIT',
        lines: [{ productId, quantity: '5', unitPrice: '10' }],
      })
      .expect(201);
    expect(await stock()).toBe(before - 5);
    expect(Number(await supplierBalance())).toBeCloseTo(owed - 50, 2);
    expect(await balanced()).toBe(true);
  });

  it('a purchase cannot be cancelled once its goods were sold', async () => {
    const all = await stock();
    const sold = await http
      .post('/sales/invoices')
      .set(bearer(admin))
      .send(saleBody(String(all), { paymentKind: 'CASH', customerId: undefined }))
      .expect(201);
    expect(await stock()).toBe(0);
    await http.post(`/purchases/invoices/${purchaseId}/cancel`).set(bearer(admin)).send({ reason: 'oops' }).expect(400);
    await http.post(`/sales/invoices/${sold.body.id}/cancel`).set(bearer(admin)).send({ reason: 'cleanup' }).expect(201);
    expect(await stock()).toBe(all);
    expect(await balanced()).toBe(true);
  });
  it('cancelling a purchase takes its cost out of the average, so stock value keeps equal to the ledger', async () => {
    const s = uid();
    const pid = (
      await http
        .post('/products')
        .set(bearer(admin))
        .send({ code: `PC-${s}`, nameAr: 'صنف إلغاء', nameEn: 'Cancel item', baseUnitId: unitId, retailPrice: '40', wholesalePrice: '30' })
        .expect(201)
    ).body.id as string;
    const buy = (price: string) =>
      http
        .post('/purchases/invoices')
        .set(bearer(admin))
        .send({ idempotencyKey: `pc-${uid()}`, invoiceDate: today, supplierId, warehouseId: mainId, paymentKind: 'CREDIT', lines: [{ productId: pid, quantity: '10', unitPrice: price }] })
        .expect(201);
    const avg = async () => Number((await http.get(`/products/${pid}`).set(bearer(admin)).expect(200)).body.avgCost);
    const qty = async () => {
      const r = await http.get(`/inventory/balances?warehouseId=${mainId}&productId=${pid}`).set(bearer(admin)).expect(200);
      return r.body.items.length ? Number(r.body.items[0].quantity) : 0;
    };

    const inv0 = await tb('13');
    const first = await buy('10'); // 10 @ 10
    await buy('20'); // 10 @ 20 -> average 15
    expect(await avg()).toBeCloseTo(15, 4);
    expect(await tb('13')).toBeCloseTo(inv0 + 300, 2);

    await http.post(`/purchases/invoices/${first.body.id}/cancel`).set(bearer(admin)).send({ reason: 'wrong price' }).expect(201);

    // 10 units remain, all at 20: average 20, value 200, and the ledger moved by the same 200.
    expect(await qty()).toBe(10);
    expect(await avg()).toBeCloseTo(20, 4);
    expect((await qty()) * (await avg())).toBeCloseTo((await tb('13')) - inv0, 2);
    expect(await balanced()).toBe(true);
  });
});
