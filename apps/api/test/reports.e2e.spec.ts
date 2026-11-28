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

d('financial statements, aging, dashboard and exports (requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let rep: string;
  let mainId: string;
  let productId: string;
  let customerId: string;
  let supplierId: string;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string, t = admin) => http.get(url).set(bearer(t));
  const income = async () => (await get(`/reports/income-statement?from=${today}&to=${today}`).expect(200)).body;
  const dash = async () => (await get('/reports/dashboard').expect(200)).body;
  const binary = (url: string, t = admin) =>
    http.get(url).set(bearer(t)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());
    admin = (await http.post('/auth/login').send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD }).expect(200)).body.accessToken;
    const email = `rep-${uid()}@test.local`;
    await http.post('/users').set(bearer(admin)).send({ email, fullName: 'Rep', password: 'long-password-123', roleCodes: ['REPRESENTATIVE'] }).expect(201);
    rep = (await http.post('/auth/login').send({ email, password: 'long-password-123' }).expect(200)).body.accessToken;

    const s = uid();
    const unitId = (await http.post('/units').set(bearer(admin)).send({ code: `U-${s}`, nameAr: 'قطعة', nameEn: 'Piece' }).expect(201)).body.id;
    mainId = (await http.post('/warehouses').set(bearer(admin)).send({ code: `W-${s}`, nameAr: 'رئيسي', nameEn: 'Main', type: 'MAIN' }).expect(201)).body.id;
    productId = (await http.post('/products').set(bearer(admin)).send({ code: `P-${s}`, nameAr: 'صنف', nameEn: 'Item', baseUnitId: unitId, retailPrice: '20', wholesalePrice: '15' }).expect(201)).body.id;
    supplierId = (await http.post('/suppliers').set(bearer(admin)).send({ code: `S-${s}`, nameAr: 'مورد' }).expect(201)).body.id;
    customerId = (await http.post('/customers').set(bearer(admin)).send({ code: `C-${s}`, nameAr: 'عميل', nameEn: 'Customer', creditLimit: '100000' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('the balance sheet balances on a fresh database and after every kind of posting', async () => {
    const before = (await get(`/reports/balance-sheet?asOf=${today}`).expect(200)).body;
    expect(before.balanced).toBe(true);
    await http.post('/purchases/invoices').set(bearer(admin)).send({ idempotencyKey: `p-${uid()}`, invoiceDate: today, supplierId, warehouseId: mainId, paymentKind: 'CREDIT', lines: [{ productId, quantity: '100', unitPrice: '10' }] }).expect(201);
    const after = (await get(`/reports/balance-sheet?asOf=${today}`).expect(200)).body;
    expect(after.balanced).toBe(true);
    expect(n(after.totalAssets)).toBeCloseTo(n(before.totalAssets) + 1000, 2);
    expect(n(after.totalLiabilities)).toBeCloseTo(n(before.totalLiabilities) + 1000, 2);
  });

  it('income statement: a sale adds revenue, cost of goods and profit; figures come from posted journals', async () => {
    const i0 = await income();
    const d0 = await dash();
    await http.post('/sales/invoices').set(bearer(admin)).send({ idempotencyKey: `s-${uid()}`, invoiceDate: today, paymentKind: 'CASH', warehouseId: mainId, lines: [{ productId, quantity: '10' }] }).expect(201);
    const i1 = await income();
    expect(n(i1.totalRevenue) - n(i0.totalRevenue)).toBeCloseTo(200, 2);
    expect(n(i1.totalCostOfGoodsSold) - n(i0.totalCostOfGoodsSold)).toBeCloseTo(100, 2);
    expect(n(i1.netProfit) - n(i0.netProfit)).toBeCloseTo(100, 2);
    expect(n(i1.grossProfit)).toBeCloseTo(n(i1.totalRevenue) - n(i1.totalCostOfGoodsSold), 2);
    expect(n(i1.netProfit)).toBeCloseTo(n(i1.grossProfit) - n(i1.totalOperatingExpenses), 2);

    const d1 = await dash();
    expect(n(d1.sales.today) - n(d0.sales.today)).toBeCloseTo(200, 2);
    expect(n(d1.cash.total) - n(d0.cash.total)).toBeCloseTo(200, 2);
    expect(n(d1.inventoryValue) - n(d0.inventoryValue)).toBeCloseTo(-100, 2);
    expect(d1.salesTrend).toHaveLength(14);
    expect(d1.salesTrend[13].date).toBe(today);
  });

  it('a sales return reduces net sales and the dashboard follows', async () => {
    const i0 = await income();
    await http.post('/sales/returns').set(bearer(admin)).send({ idempotencyKey: `r-${uid()}`, invoiceDate: today, paymentKind: 'CASH', warehouseId: mainId, condition: 'GOOD', lines: [{ productId, quantity: '2' }] }).expect(201);
    const i1 = await income();
    expect(n(i1.totalRevenue) - n(i0.totalRevenue)).toBeCloseTo(-40, 2);
    expect((await get(`/reports/balance-sheet?asOf=${today}`).expect(200)).body.balanced).toBe(true);
  });

  it('cash flow reconciles: opening + inflow − outflow = closing, and closing equals the dashboard cash position', async () => {
    const cf = (await get(`/reports/cash-flow?from=2000-01-01&to=${today}`).expect(200)).body;
    expect(n(cf.closingCash)).toBeCloseTo(n(cf.openingCash) + n(cf.totalInflow) - n(cf.totalOutflow), 2);
    expect(n(cf.closingCash)).toBeCloseTo(n((await dash()).cash.total), 2);
    const sources = cf.lines.map((l: { source: string }) => l.source);
    expect(sources).toContain('SALES_INVOICE');
    const today1 = (await get(`/reports/cash-flow?from=${today}&to=${today}`).expect(200)).body;
    expect(n(today1.closingCash)).toBeCloseTo(n(cf.closingCash), 2);
  });

  it('aging lists open customer and supplier balances in buckets and settles FIFO', async () => {
    await http.post('/sales/invoices').set(bearer(admin)).send({ idempotencyKey: `s-${uid()}`, invoiceDate: today, paymentKind: 'CREDIT', customerId, warehouseId: mainId, lines: [{ productId, quantity: '5' }] }).expect(201);
    const c = (await get('/reports/aging/customers').expect(200)).body;
    const row = c.rows.find((r: { id: string }) => r.id === customerId);
    expect(row.current).toBe('100.00');
    expect(row.total).toBe('100.00');
    expect(n(c.totals.total)).toBeGreaterThanOrEqual(100);

    const sup = (await get('/reports/aging/suppliers').expect(200)).body;
    expect(sup.rows.find((r: { id: string }) => r.id === supplierId).total).toBe('1000.00');

    const box = (await http.post('/financial-accounts').set(bearer(admin)).send({ code: `RB-${uid()}`, kind: 'CASHBOX', nameAr: 'خزينة', nameEn: 'Box', openingBalance: '0' }).expect(201)).body;
    await http.post('/treasury/vouchers').set(bearer(admin)).send({ idempotencyKey: `v-${uid()}`, type: 'RECEIPT', date: today, amount: '40', financialAccountId: box.id, partyType: 'CUSTOMER', partyId: customerId, description: 'partial' }).expect(201);
    const after = (await get('/reports/aging/customers').expect(200)).body;
    expect(after.rows.find((r: { id: string }) => r.id === customerId).total).toBe('60.00');
    expect(sup.type).toBe('SUPPLIER');
    await get('/reports/aging/others').expect(400);
  });

  it('the dashboard shows receivables, payables and the top customer from real postings', async () => {
    const d1 = await dash();
    expect(n(d1.receivables)).toBeGreaterThanOrEqual(60);
    expect(n(d1.payables)).toBeGreaterThanOrEqual(1000);
    expect(d1.topProducts.length).toBeGreaterThan(0);
    expect(d1.topCustomers.some((c: { customer?: { id: string } }) => c.customer?.id === customerId)).toBe(true);
  });

  it('the dashboard supports period, branch and representative filters and returns comparison data', async () => {
    const d30 = (await get('/reports/dashboard?days=30').expect(200)).body;
    expect(d30.salesTrend).toHaveLength(30);
    expect(d30.salesTrend[0]).toHaveProperty('previous');
    expect(d30.comparison).toHaveProperty('salesYesterday');
    expect(d30.comparison).toHaveProperty('salesPreviousMonthToDate');
    expect(Array.isArray(d30.topRepresentatives)).toBe(true);
    // a representative with no sales yields zero sales, while unfiltered totals are unchanged
    const none = (await get('/reports/dashboard?representativeId=00000000-0000-4000-8000-000000000000').expect(200)).body;
    expect(n(none.sales.month)).toBe(0);
    expect(none.filters.representativeId).toBe('00000000-0000-4000-8000-000000000000');
    const all = await dash();
    expect(n(all.sales.month)).toBeGreaterThan(0);
    await get('/reports/dashboard?days=5').expect(400);
    await get('/reports/dashboard?branchId=not-a-uuid').expect(400);
  });

  it('exports Excel (Arabic and English) and English PDF; refuses Arabic PDF and unknown reports', async () => {
    const xlsx = await binary(`/reports/export/trial-balance?format=xlsx&lang=ar`).expect(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const inc = await binary(`/reports/export/income-statement?format=xlsx&lang=en&from=${today}&to=${today}`).expect(200);
    expect((inc.body as Buffer).length).toBeGreaterThan(1000);
    const pdf = await binary(`/reports/export/balance-sheet?format=pdf&lang=en&asOf=${today}`).expect(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    await get(`/reports/export/balance-sheet?format=pdf&lang=ar&asOf=${today}`).expect(400);
    await get('/reports/export/nothing?format=xlsx').expect(400);
    await get('/reports/export/income-statement?format=xlsx').expect(400); // dates required
  });

  it('requires permissions and validates dates', async () => {
    await get('/reports/income-statement?from=2026-01-01&to=2026-01-31', rep).expect(403);
    await get('/reports/dashboard', rep).expect(403);
    await get('/reports/income-statement?from=2026-01-01').expect(400);
    await get('/reports/cash-flow?from=2026-02-01&to=2026-01-01').expect(400);
  });
});
