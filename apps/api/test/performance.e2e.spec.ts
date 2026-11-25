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

// Generous ceilings: they catch accidental N+1 queries or missing indexes, not machine noise.
const SALE_P95_MS = 2_500;
const REPORT_MS = 5_000;

d('performance and concurrency (requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let mainId: string;
  let productId: string;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

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
    await http.post('/purchases/invoices').set(bearer(admin)).send({ idempotencyKey: `pur-${s}`, invoiceDate: today, supplierId, warehouseId: mainId, paymentKind: 'CREDIT', lines: [{ productId, quantity: '100', unitPrice: '10' }] }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  const sell = (qty: string) =>
    http.post('/sales/invoices').set(bearer(admin)).send({ idempotencyKey: `s-${uid()}${uid()}`, invoiceDate: today, paymentKind: 'CASH', warehouseId: mainId, lines: [{ productId, quantity: qty }] });

  it('150 concurrent sales of the last 100 units: exactly 100 succeed, stock never goes negative', async () => {
    const times: number[] = [];
    const statuses: number[] = [];
    const workers = 10;
    let next = 0;
    await Promise.all(
      Array.from({ length: workers }, async () => {
        while (next < 150) {
          next += 1;
          const t0 = Date.now();
          const r = await sell('1');
          times.push(Date.now() - t0);
          statuses.push(r.status);
        }
      }),
    );
    expect(statuses.filter((s) => s === 201)).toHaveLength(100);
    expect(statuses.filter((s) => s !== 201 && s !== 400 && s !== 409)).toEqual([]); // refusals are clean, never 500s
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.95)]).toBeLessThan(SALE_P95_MS);

    const bal = (await http.get(`/inventory/balances?warehouseId=${mainId}&productId=${productId}`).set(bearer(admin)).expect(200)).body.items;
    expect(bal.length === 0 || n(bal[0].quantity) === 0).toBe(true);
    expect((await http.get('/accounting/reports/trial-balance').set(bearer(admin)).expect(200)).body.balanced).toBe(true);
  });

  it('reports and the dashboard answer quickly with real volume behind them', async () => {
    for (const path of ['/reports/dashboard', `/reports/income-statement?from=2000-01-01&to=${today}`, `/reports/balance-sheet?asOf=${today}`, '/reports/aging/customers', '/accounting/reports/trial-balance']) {
      const t0 = Date.now();
      await http.get(path).set(bearer(admin)).expect(200);
      expect(Date.now() - t0).toBeLessThan(REPORT_MS);
    }
  });

  it('paged lists stay bounded', async () => {
    const r = await http.get('/sales/invoices?pageSize=25').set(bearer(admin)).expect(200);
    expect(r.body.items.length).toBeLessThanOrEqual(25);
    expect(r.body.total).toBeGreaterThanOrEqual(100);
    const big = await http.get('/sales/invoices?pageSize=100000').set(bearer(admin)).expect(200);
    expect(big.body.items.length).toBeLessThanOrEqual(200); // the server caps the page size
  });
});
