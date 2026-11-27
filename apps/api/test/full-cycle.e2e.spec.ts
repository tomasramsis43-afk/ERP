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

/**
 * One complete business cycle across every module, then the cross-module invariants that must
 * always hold: the ledger balances, sub-ledgers equal their control accounts, stock value equals
 * the inventory accounts, and every statement agrees with every other.
 */
d('full business cycle and cross-module invariants (requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let repToken: string;
  let repId: string;
  let vanId: string;
  let mainId: string;
  let productId: string;
  let customerId: string;
  let supplierId: string;
  let boxId: string;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const post = (url: string, body: object, t = admin) => http.post(url).set(bearer(t)).send(body);
  const get = (url: string, t = admin) => http.get(url).set(bearer(t));
  const tb = async () => (await get('/accounting/reports/trial-balance').expect(200)).body;
  const bal = (rows: { code: string; closingDebit: string; closingCredit: string }[], code: string) => {
    const r = rows.find((x) => x.code === code);
    return r ? n(r.closingDebit) - n(r.closingCredit) : 0;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());
    admin = (await http.post('/auth/login').send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD }).expect(200)).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets up master data, a representative with a van, and a cash box', async () => {
    const s = uid();
    const unitId = (await post('/units', { code: `U-${s}`, nameAr: 'قطعة', nameEn: 'Piece' }).expect(201)).body.id;
    mainId = (await post('/warehouses', { code: `W-${s}`, nameAr: 'رئيسي', nameEn: 'Main', type: 'MAIN' }).expect(201)).body.id;
    productId = (await post('/products', { code: `P-${s}`, nameAr: 'صنف', nameEn: 'Item', baseUnitId: unitId, retailPrice: '20', wholesalePrice: '15' }).expect(201)).body.id;
    supplierId = (await post('/suppliers', { code: `S-${s}`, nameAr: 'مورد' }).expect(201)).body.id;
    customerId = (await post('/customers', { code: `C-${s}`, nameAr: 'عميل', creditLimit: '100000' }).expect(201)).body.id;
    boxId = (await post('/financial-accounts', { code: `FC-${s}`, kind: 'CASHBOX', nameAr: 'خزينة', nameEn: 'Box', openingBalance: '10000' }).expect(201)).body.id;
    const email = `rep-${s}@test.local`;
    const user = (await post('/users', { email, fullName: 'Rep', password: 'long-password-123', roleCodes: ['REPRESENTATIVE'] }).expect(201)).body;
    const vehicle = (await post('/vehicles', { plateNumber: `PL-${s}`, model: 'Van' }).expect(201)).body;
    vanId = vehicle.warehouseId;
    repId = (await post('/representatives', { code: `R${s}`.slice(0, 12), nameAr: 'مندوب', userId: user.id, vehicleId: vehicle.id }).expect(201)).body.id;
    repToken = (await http.post('/auth/login').send({ email, password: 'long-password-123' }).expect(200)).body.accessToken;
  });

  it('buys on credit, pays part of the supplier, and loads the van', async () => {
    await post('/purchases/invoices', { idempotencyKey: `pur-${uid()}`, invoiceDate: today, supplierId, warehouseId: mainId, paymentKind: 'CREDIT', lines: [{ productId, quantity: '200', unitPrice: '10' }] }).expect(201);
    await post('/treasury/vouchers', { idempotencyKey: `pay-${uid()}`, type: 'PAYMENT', date: today, amount: '500', financialAccountId: boxId, partyType: 'SUPPLIER', partyId: supplierId, description: 'on account' }).expect(201);
    await post('/inventory/transfers', { date: today, fromWarehouseId: mainId, toWarehouseId: vanId, lines: [{ productId, quantity: '50' }] }).expect(201);
  });

  it('sells from the van (cash and credit), from the warehouse on credit, collects, returns and cancels', async () => {
    const rep = (body: object) => post('/sales/invoices', { idempotencyKey: `s-${uid()}`, invoiceDate: today, warehouseId: vanId, representativeId: repId, ...body }, repToken);
    await rep({ paymentKind: 'CASH', lines: [{ productId, quantity: '10' }] }).expect(201);
    await rep({ paymentKind: 'CREDIT', customerId, lines: [{ productId, quantity: '5' }] }).expect(201);
    await post('/sales/invoices', { idempotencyKey: `s-${uid()}`, invoiceDate: today, paymentKind: 'CREDIT', customerId, warehouseId: mainId, lines: [{ productId, quantity: '20' }] }).expect(201);
    const doomed = (await post('/sales/invoices', { idempotencyKey: `s-${uid()}`, invoiceDate: today, paymentKind: 'CREDIT', customerId, warehouseId: mainId, lines: [{ productId, quantity: '2' }] }).expect(201)).body;
    await post(`/sales/invoices/${doomed.id}/cancel`, { reason: 'duplicate entry' }).expect(201);
    await post('/treasury/vouchers', { idempotencyKey: `rc-${uid()}`, type: 'RECEIPT', date: today, amount: '150', financialAccountId: boxId, partyType: 'CUSTOMER', partyId: customerId, description: 'collection' }).expect(201);
    await post('/sales/returns', { idempotencyKey: `r-${uid()}`, invoiceDate: today, paymentKind: 'CREDIT', customerId, warehouseId: mainId, condition: 'GOOD', lines: [{ productId, quantity: '3' }] }).expect(201);
  });

  it("closes the representative's day with a one-unit shortage", async () => {
    const preview = (await get(`/representatives/${repId}/closing-preview?date=${today}`, repToken).expect(200)).body;
    const expectedQty = n(preview.lines[0].expectedQty);
    expect(expectedQty).toBe(35); // 50 loaded − 10 − 5
    await post(`/representatives/${repId}/close-day`, { date: today, declaredCash: preview.expectedCash, counts: [{ productId, quantity: String(expectedQty - 1) }], differenceReason: 'cycle test shortage' }, repToken).expect(201);
    expect(n((await get(`/representatives/${repId}`).expect(200)).body.custodyBalance)).toBe(0);
  });

  it('the ledger balances and sub-ledgers equal their control accounts', async () => {
    const t = await tb();
    expect(t.balanced).toBe(true);
    const dash = (await get('/reports/dashboard').expect(200)).body;
    expect(n(dash.receivables)).toBeCloseTo(bal(t.rows, '12'), 2);
    expect(n(dash.payables)).toBeCloseTo(-bal(t.rows, '21'), 2);
    // Customer: 20×20 + 5×20 − 3×20 − 150 = 290; supplier: 2000 − 500 = 1500 (this cycle's part).
    const cust = (await get('/reports/aging/customers').expect(200)).body.rows.find((r: { id: string }) => r.id === customerId);
    expect(n(cust.total)).toBeCloseTo(290, 2);
    const sup = (await get('/reports/aging/suppliers').expect(200)).body.rows.find((r: { id: string }) => r.id === supplierId);
    expect(n(sup.total)).toBeCloseTo(1500, 2);
  });

  it('stock value equals the inventory accounts (warehouses plus vans)', async () => {
    const t = await tb();
    const dash = (await get('/reports/dashboard').expect(200)).body;
    expect(n(dash.inventoryValue)).toBeCloseTo(bal(t.rows, '13') + bal(t.rows, '1402'), 1);
  });

  it('statements agree with each other', async () => {
    const bs = (await get(`/reports/balance-sheet?asOf=${today}`).expect(200)).body;
    expect(bs.balanced).toBe(true);
    const is = (await get(`/reports/income-statement?from=2000-01-01&to=${today}`).expect(200)).body;
    // Everything earned so far is "current earnings" on the balance sheet.
    expect(n(is.netProfit)).toBeCloseTo(n(bs.currentEarnings), 2);
    const cf = (await get(`/reports/cash-flow?from=2000-01-01&to=${today}`).expect(200)).body;
    expect(n(cf.closingCash)).toBeCloseTo(n((await get('/reports/dashboard').expect(200)).body.cash.total), 2);
  });

  it('the audit trail recorded the cycle and cannot be altered through the API', async () => {
    const log = (await get('/audit-logs?pageSize=50').expect(200)).body;
    const actions = log.items.map((i: { action: string }) => i.action);
    expect(actions).toEqual(expect.arrayContaining(['CLOSE_DAY']));
    await http.delete('/audit-logs/anything').set(bearer(admin)).expect(404);
    await http.patch('/audit-logs/anything').set(bearer(admin)).send({ action: 'X' }).expect(404);
  });
});
