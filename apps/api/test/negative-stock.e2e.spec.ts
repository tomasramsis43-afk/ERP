import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);

d('negative-stock approval (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let adminToken: string;
  let repToken: string;
  let productId: string;
  let warehouseId: string;
  let vanWarehouseId: string;
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });
  const rep = () => ({ Authorization: `Bearer ${repToken}` });
  const sale = (idempotencyKey: string, reason?: string) => ({
    idempotencyKey,
    invoiceDate: today(),
    paymentKind: 'CASH',
    warehouseId,
    lines: [{ productId, quantity: '5' }],
    ...(reason ? { negativeStockReason: reason } : {}),
  });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());

    const login = async (email: string, password: string) =>
      (await http.post('/auth/login').send({ email, password }).expect(200)).body.accessToken as string;
    adminToken = await login(process.env.SEED_ADMIN_EMAIL!, process.env.SEED_ADMIN_PASSWORD!);

    const s = uid();
    const email = `rep-${s}@example.com`;
    const password = 'Test12345!';
    const repUserId = (
      await http.post('/users').set(admin()).send({ email, fullName: 'Test Representative', password, roleCodes: ['REPRESENTATIVE'] }).expect(201)
    ).body.id;
    // A representative sells only from their own van, so the permission check runs against the van's (empty) stock.
    const vehicle = (await http.post('/vehicles').set(admin()).send({ plateNumber: `NS-${s}`, model: 'Van' }).expect(201)).body;
    vanWarehouseId = vehicle.warehouseId;
    await http.post('/representatives').set(admin()).send({ code: `N${s}`.slice(0, 12), nameAr: 'مندوب', userId: repUserId, vehicleId: vehicle.id }).expect(201);
    repToken = await login(email, password);

    const unitId = (await http.post('/units').set(admin()).send({ code: `U-${s}`, nameAr: 'قطعة', nameEn: 'Piece' }).expect(201)).body.id;
    warehouseId = (await http.post('/warehouses').set(admin()).send({ code: `W-${s}`, nameAr: 'مخزن', nameEn: 'Main', type: 'MAIN' }).expect(201)).body.id;
    productId = (
      await http
        .post('/products')
        .set(admin())
        .send({ code: `P-${s}`, nameAr: 'صنف', nameEn: 'Item', baseUnitId: unitId, retailPrice: '10' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks unauthorised oversells, requires a reason, then records an approved negative balance', async () => {
    const unauthorised = await http
      .post('/sales/invoices')
      .set(rep())
      .send({ ...sale(`ns-rep-${uid()}`, 'No permission'), warehouseId: vanWarehouseId })
      .expect(400);
    expect(JSON.stringify(unauthorised.body)).toMatch(/insufficient stock/i);

    const noReason = await http.post('/sales/invoices').set(admin()).send(sale(`ns-noreason-${uid()}`)).expect(400);
    expect(JSON.stringify(noReason.body)).toMatch(/recorded reason/i);

    const approved = await http
      .post('/sales/invoices')
      .set(admin())
      .send(sale(`ns-ok-${uid()}`, 'Emergency sale approved by management'))
      .expect(201);
    expect(approved.body.status).toBe('POSTED');

    const balances = await http
      .get(`/inventory/balances?warehouseId=${warehouseId}&productId=${productId}`)
      .set(admin())
      .expect(200);
    expect(Number(balances.body.items[0].quantity)).toBe(-5);

    const movements = await http
      .get(`/inventory/movements?warehouseId=${warehouseId}&productId=${productId}`)
      .set(admin())
      .expect(200);
    expect(JSON.stringify(movements.body.items)).toMatch(/Negative stock approved/i);
  });
});
