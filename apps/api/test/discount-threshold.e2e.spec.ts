import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);

d('configurable discount approval threshold (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let adminToken: string;
  let managerToken: string;
  let productId: string;
  let warehouseId: string;
  let previous: string;
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });
  const manager = () => ({ Authorization: `Bearer ${managerToken}` });
  const setThreshold = (value: string) =>
    http.put('/settings').set(admin()).send({ settings: [{ key: 'sales.discountApprovalThreshold', value }] }).expect(200);
  const sale = (discount: string) => ({
    idempotencyKey: `disc-${uid()}`,
    invoiceDate: today(),
    paymentKind: 'CASH',
    warehouseId,
    lines: [{ productId, quantity: '10', unitPrice: '100', discount }],
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

    const settings = (await http.get('/settings').set(admin()).expect(200)).body;
    previous = String(settings.find((s: { key: string }) => s.key === 'sales.discountApprovalThreshold')?.value ?? '0.05');

    const s = uid();
    const email = `manager-${s}@example.com`;
    const password = 'Test12345!';
    await http
      .post('/users')
      .set(admin())
      .send({ email, fullName: 'Test Sales Manager', password, roleCodes: ['SALES_MANAGER'] })
      .expect(201);
    managerToken = await login(email, password);

    const unitId = (await http.post('/units').set(admin()).send({ code: `U-${s}`, nameAr: 'قطعة', nameEn: 'Piece' }).expect(201)).body.id;
    warehouseId = (await http.post('/warehouses').set(admin()).send({ code: `W-${s}`, nameAr: 'مخزن', nameEn: 'Main', type: 'MAIN' }).expect(201)).body.id;
    productId = (
      await http
        .post('/products')
        .set(admin())
        .send({ code: `P-${s}`, nameAr: 'صنف', nameEn: 'Item', baseUnitId: unitId, retailPrice: '100' })
        .expect(201)
    ).body.id;
    await http
      .post('/inventory/opening-stock')
      .set(admin())
      .send({ date: today(), warehouseId, lines: [{ productId, quantity: '100', unitCost: '50' }] })
      .expect(201);
  });

  afterAll(async () => {
    await setThreshold(previous);
    await app.close();
  });

  it('reads the approval threshold from settings instead of a hardcoded 5%', async () => {
    await setThreshold('0.05');
    const blocked = await http.post('/sales/invoices').set(manager()).send(sale('60')).expect(403);
    expect(JSON.stringify(blocked.body)).toMatch(/approval threshold/i);

    await setThreshold('0.10');
    const allowed = await http.post('/sales/invoices').set(manager()).send(sale('60')).expect(201);
    expect(allowed.body.status).toBe('POSTED');

    const blockedAgain = await http.post('/sales/invoices').set(manager()).send(sale('120')).expect(403);
    expect(JSON.stringify(blockedAgain.body)).toMatch(/approval threshold/i);
  });
});
