import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const iso = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const today = iso(0);
const yesterday = iso(-1);
const uid = () => Math.random().toString(36).slice(2, 10);

d('representatives, vehicles, custody, daily closing and commissions (requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let mainId: string;
  let unitId: string;
  let productId: string;
  let customerId: string;
  let routeId: string;
  let payBoxId: string;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = async (email: string, password: string) =>
    (await http.post('/auth/login').send({ email, password }).expect(200)).body.accessToken as string;

  async function tb(code: string): Promise<number> {
    const r = await http.get('/accounting/reports/trial-balance').set(bearer(admin)).expect(200);
    const row = r.body.rows.find((x: { code: string }) => x.code === code);
    return row ? Number(row.closingDebit) - Number(row.closingCredit) : 0;
  }
  const balanced = async () => (await http.get('/accounting/reports/trial-balance').set(bearer(admin)).expect(200)).body.balanced;

  interface Setup { repId: string; token: string; vanId: string; custodyAccountCode: string }
  async function newRep(): Promise<Setup> {
    const s = uid();
    const email = `rep-${s}@test.local`;
    const user = (await http.post('/users').set(bearer(admin)).send({ email, fullName: 'Rep', password: 'long-password-123', roleCodes: ['REPRESENTATIVE'] }).expect(201)).body;
    const vehicle = (await http.post('/vehicles').set(bearer(admin)).send({ plateNumber: `PL-${s}`, model: 'Van' }).expect(201)).body;
    const rep = (
      await http
        .post('/representatives')
        .set(bearer(admin))
        .send({ code: `R${s}`.slice(0, 12), nameAr: 'مندوب', nameEn: 'Rep', userId: user.id, vehicleId: vehicle.id, routeId })
        .expect(201)
    ).body;
    return { repId: rep.id, token: await login(email, 'long-password-123'), vanId: vehicle.warehouseId, custodyAccountCode: rep.financialAccount.code };
  }
  const load = (vanId: string, qty: string, date: string) =>
    http.post('/inventory/transfers').set(bearer(admin)).send({ date, fromWarehouseId: mainId, toWarehouseId: vanId, lines: [{ productId, quantity: qty }] }).expect(201);
  const sell = (r: Setup, over: Record<string, unknown>) =>
    http
      .post('/sales/invoices')
      .set(bearer(r.token))
      .send({ idempotencyKey: `s-${uid()}`, invoiceDate: today, warehouseId: r.vanId, representativeId: r.repId, lines: [{ productId, quantity: '1' }], ...over });
  const closeDay = (r: Setup, body: Record<string, unknown>, token = r.token) =>
    http.post(`/representatives/${r.repId}/close-day`).set(bearer(token)).send(body);
  const custodyBalance = async (r: Setup) => Number((await http.get(`/representatives/${r.repId}`).set(bearer(admin)).expect(200)).body.custodyBalance);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());
    admin = await login(process.env.SEED_ADMIN_EMAIL!, process.env.SEED_ADMIN_PASSWORD!);

    const s = uid();
    unitId = (await http.post('/units').set(bearer(admin)).send({ code: `U-${s}`, nameAr: 'قطعة', nameEn: 'Piece' }).expect(201)).body.id;
    mainId = (await http.post('/warehouses').set(bearer(admin)).send({ code: `W-${s}`, nameAr: 'رئيسي', nameEn: 'Main', type: 'MAIN' }).expect(201)).body.id;
    productId = (await http.post('/products').set(bearer(admin)).send({ code: `P-${s}`, nameAr: 'صنف', nameEn: 'Item', baseUnitId: unitId, retailPrice: '20', wholesalePrice: '15' }).expect(201)).body.id;
    const supplierId = (await http.post('/suppliers').set(bearer(admin)).send({ code: `S-${s}`, nameAr: 'مورد' }).expect(201)).body.id;
    await http
      .post('/purchases/invoices')
      .set(bearer(admin))
      .send({ idempotencyKey: `pur-${s}`, invoiceDate: today, supplierId, warehouseId: mainId, paymentKind: 'CREDIT', lines: [{ productId, quantity: '1000', unitPrice: '10' }] })
      .expect(201);
    customerId = (await http.post('/customers').set(bearer(admin)).send({ code: `C-${s}`, nameAr: 'عميل', creditLimit: '100000' }).expect(201)).body.id;
    const city = (await http.post('/geo-areas').set(bearer(admin)).send({ level: 'CITY', nameAr: 'مدينة', nameEn: `City ${s}` }).expect(201)).body;
    routeId = (await http.post('/routes').set(bearer(admin)).send({ code: `RT-${s}`, nameAr: 'خط', nameEn: 'Route', geoAreaId: city.id }).expect(201)).body.id;
    payBoxId = (await http.post('/financial-accounts').set(bearer(admin)).send({ code: `PB-${s}`, kind: 'CASHBOX', nameAr: 'خزينة', nameEn: 'Pay box', openingBalance: '1000' }).expect(201)).body.id;
    // 2% of net sales for every representative.
    await http.post('/representatives/commission-rules').set(bearer(admin)).send({ basis: 'SALES', ratePercent: '2' }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  const A = {} as Setup;
  it('creating a representative opens a custody account and a vehicle warehouse', async () => {
    Object.assign(A, await newRep());
    expect(A.custodyAccountCode).toMatch(/^REP-/);
    const rep = (await http.get(`/representatives/${A.repId}`).set(bearer(admin)).expect(200)).body;
    expect(rep.custodyBalance).toBe('0.00');
    expect(rep.vehicle.warehouse.type).toBe('VEHICLE');
    // One vehicle belongs to one representative.
    await http.post('/representatives').set(bearer(admin)).send({ code: `X${uid()}`.slice(0, 12), nameAr: 'آخر', vehicleId: rep.vehicleId }).expect(409);
  });

  it('loading the van is a transfer, not a sale', async () => {
    const [sales0, cogs0] = await Promise.all([tb('41'), tb('51')]);
    await load(A.vanId, '40', today);
    expect(await tb('41')).toBeCloseTo(sales0, 2);
    expect(await tb('51')).toBeCloseTo(cogs0, 2);
  });

  it('a representative sells only from their own van and for themselves', async () => {
    const other = await newRep();
    await sell(A, { paymentKind: 'CASH', warehouseId: mainId }).expect(400);
    await sell(A, { paymentKind: 'CASH', warehouseId: other.vanId }).expect(400);
    await sell(other, { paymentKind: 'CASH', representativeId: A.repId, warehouseId: A.vanId }).expect(403);
  });

  it('cash sales go to the custody account, credit sales to the customer', async () => {
    const cash0 = await tb('1101');
    await sell(A, { paymentKind: 'CASH', lines: [{ productId, quantity: '10' }] }).expect(201);
    await sell(A, { paymentKind: 'CREDIT', customerId, lines: [{ productId, quantity: '5' }] }).expect(201);
    expect(await custodyBalance(A)).toBe(200);
    expect(await tb('1101')).toBeCloseTo(cash0, 2); // the main cash box is untouched
    expect(await balanced()).toBe(true);
  });

  it('a representative collection must land in that representative\'s custody', async () => {
    const body = { idempotencyKey: `c-${uid()}`, type: 'RECEIPT', date: today, amount: '30', partyType: 'CUSTOMER', partyId: customerId, description: 'collection', representativeId: A.repId };
    await http.post('/treasury/vouchers').set(bearer(admin)).send({ ...body, financialAccountId: payBoxId }).expect(400);
    const rep = (await http.get(`/representatives/${A.repId}`).set(bearer(admin)).expect(200)).body;
    await http.post('/treasury/vouchers').set(bearer(admin)).send({ ...body, financialAccountId: rep.financialAccountId }).expect(201);
    expect(await custodyBalance(A)).toBe(230);
  });

  it('the preview shows what the books expect', async () => {
    const r = (await http.get(`/representatives/${A.repId}/closing-preview?date=${today}`).set(bearer(A.token)).expect(200)).body;
    expect(Number(r.expectedCash)).toBe(230);
    expect(Number(r.salesCash)).toBe(200);
    expect(Number(r.salesCredit)).toBe(100);
    expect(Number(r.collections)).toBe(30);
    expect(Number(r.lines[0].expectedQty)).toBe(25);
  });

  it('refuses a close with a missing count, a future date, or by another representative', async () => {
    await closeDay(A, { date: today, declaredCash: '230', counts: [] }).expect(400);
    await closeDay(A, { date: iso(2), declaredCash: '230', counts: [{ productId, quantity: '25' }] }).expect(400);
    const other = await newRep();
    await closeDay(A, { date: today, declaredCash: '230', counts: [{ productId, quantity: '25' }] }, other.token).expect(403);
  });

  it('refuses to close with a cash or stock difference unless a reason is documented', async () => {
    await closeDay(A, { date: today, declaredCash: '220', counts: [{ productId, quantity: '24' }] }).expect(400);
    await closeDay(A, { date: today, declaredCash: '220', counts: [{ productId, quantity: '24' }], differenceReason: 'x' }).expect(400);
  });

  it('closes the day: shortages are booked, cash is handed to the main box, commission accrues', async () => {
    const [mainCash0, diff0, van0, accrued0, comm0] = await Promise.all([tb('1101'), tb('59'), tb('1402'), tb('23'), tb('53')]);
    // 1 unit short (cost 10) and 10 of cash short.
    const r = await closeDay(A, { date: today, declaredCash: '220', counts: [{ productId, quantity: '24' }], differenceReason: 'one unit and 10 cash short' }).expect(201);
    expect(r.body.differenceReason).toBe('one unit and 10 cash short');
    expect(Number(r.body.cashDifference)).toBe(-10);
    expect(Number(r.body.stockDifferenceValue)).toBe(-10);
    expect(Number(r.body.commissionTotal)).toBe(6); // 2% of 200 + 2% of 100
    expect(await custodyBalance(A)).toBe(0);
    expect(await tb('1101')).toBeCloseTo(mainCash0 + 220, 2);
    expect(await tb('59')).toBeCloseTo(diff0 + 20, 2);
    expect(await tb('1402')).toBeCloseTo(van0 - 10, 2);
    expect(await tb('23')).toBeCloseTo(accrued0 - 6, 2);
    expect(await tb('53')).toBeCloseTo(comm0 + 6, 2);
    expect(await balanced()).toBe(true);
    const van = await http.get(`/inventory/balances?warehouseId=${A.vanId}&productId=${productId}`).set(bearer(admin)).expect(200);
    expect(Number(van.body.items[0].quantity)).toBe(24);
  });

  it('a day can be closed only once', async () => {
    await closeDay(A, { date: today, declaredCash: '0', counts: [{ productId, quantity: '24' }] }).expect(409);
  });

  it('days must be closed in order: an earlier day cannot be closed after a later one', async () => {
    await closeDay(A, { date: yesterday, declaredCash: '0', counts: [{ productId, quantity: '24' }] }).expect(400);
  });

  it('commission is listed once and paid once (idempotent), then nothing is left to pay', async () => {
    const list = (await http.get(`/representatives/${A.repId}/commissions`).set(bearer(admin)).expect(200)).body;
    expect(list.total).toBe(2);
    expect(Number(list.unpaidTotal)).toBe(6);
    const box0 = Number((await http.get(`/financial-accounts/${payBoxId}`).set(bearer(admin)).expect(200)).body.balance);
    const pay = { idempotencyKey: `pay-${uid()}`, date: today, financialAccountId: payBoxId };
    const [p1, p2] = await Promise.all([
      http.post(`/representatives/${A.repId}/commissions/pay`).set(bearer(admin)).send(pay),
      http.post(`/representatives/${A.repId}/commissions/pay`).set(bearer(admin)).send(pay),
    ]);
    expect([200, 201]).toContain(p1.status);
    expect([200, 201]).toContain(p2.status);
    expect(p1.body.id).toBe(p2.body.id);
    expect(Number((await http.get(`/financial-accounts/${payBoxId}`).set(bearer(admin)).expect(200)).body.balance)).toBe(box0 - 6);
    await http.post(`/representatives/${A.repId}/commissions/pay`).set(bearer(admin)).send({ ...pay, idempotencyKey: `pay-${uid()}` }).expect(400);
    expect(await balanced()).toBe(true);
  });

  it('commission on a cancelled document is clawed back exactly once', async () => {
    const B = await newRep();
    await load(B.vanId, '20', yesterday);
    const inv = (await sell(B, { paymentKind: 'CREDIT', customerId, invoiceDate: yesterday, lines: [{ productId, quantity: '5' }] }).expect(201)).body;
    const day1 = (await closeDay(B, { date: yesterday, declaredCash: '0', counts: [{ productId, quantity: '15' }], differenceReason: 'test' }).expect(201)).body;
    expect(Number(day1.commissionTotal)).toBe(2);

    await http.post(`/sales/invoices/${inv.id}/cancel`).set(bearer(admin)).send({ reason: 'customer refused' }).expect(201);
    const day2 = (await closeDay(B, { date: today, declaredCash: '0', counts: [{ productId, quantity: '20' }], differenceReason: 'test' }).expect(201)).body;
    expect(Number(day2.commissionTotal)).toBe(-2);
    const list = (await http.get(`/representatives/${B.repId}/commissions`).set(bearer(admin)).expect(200)).body;
    expect(Number(list.unpaidTotal)).toBe(0);
    expect(list.items.filter((e: { sourceType: string }) => e.sourceType === 'REVERSAL')).toHaveLength(1);
    expect(await balanced()).toBe(true);
  });

  it('a representative cannot be deactivated while custody cash is outstanding', async () => {
    const C = await newRep();
    await load(C.vanId, '5', today);
    await sell(C, { paymentKind: 'CASH', lines: [{ productId, quantity: '1' }] }).expect(201);
    await http.patch(`/representatives/${C.repId}`).set(bearer(admin)).send({ isActive: false }).expect(409);
  });

  it('vehicle expenses are recorded as payments with a category', async () => {
    const vehicles = (await http.get('/vehicles').set(bearer(admin)).expect(200)).body;
    const vehicleId = vehicles.items[0].id;
    const fuel0 = await tb('54');
    await http
      .post(`/vehicles/${vehicleId}/expenses`)
      .set(bearer(admin))
      .send({ idempotencyKey: `fuel-${uid()}`, date: today, amount: '75', category: 'FUEL', financialAccountId: payBoxId, description: 'diesel' })
      .expect(201);
    expect(await tb('54')).toBeCloseTo(fuel0 + 75, 2);
    expect(await balanced()).toBe(true);
  });
});
