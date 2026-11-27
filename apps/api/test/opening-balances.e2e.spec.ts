import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const uid = () => Math.random().toString(36).slice(2, 10);
const today = new Date().toISOString().slice(0, 10);

d('opening balances (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());
    token = (
      await http
        .post('/auth/login')
        .send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('posts balanced, tagged customer/supplier balances visible in their statements', async () => {
    const s = uid();
    const customerId = (
      await http.post('/customers').set(auth()).send({ code: `C-${s}`, nameAr: 'عميل', nameEn: 'Customer' }).expect(201)
    ).body.id;
    const supplierId = (
      await http.post('/suppliers').set(auth()).send({ code: `S-${s}`, nameAr: 'مورد', nameEn: 'Supplier' }).expect(201)
    ).body.id;

    const body = {
      date: today,
      note: 'Opening balances',
      idempotencyKey: `ob-${s}`,
      lines: [
        { partyType: 'CUSTOMER', partyId: customerId, amount: '100.00', description: 'Customer opening' },
        { partyType: 'SUPPLIER', partyId: supplierId, amount: '250.00', description: 'Supplier opening' },
      ],
    };
    const entry = await http.post('/accounting/opening-balances').set(auth()).send(body).expect(201);
    expect(entry.body.status).toBe('POSTED');
    expect(entry.body.lines).toHaveLength(3); // two parties + one equity balancing line

    const replay = await http.post('/accounting/opening-balances').set(auth()).send(body).expect(201);
    expect(replay.body.id).toBe(entry.body.id);

    const customerStatement = await http.get(`/customers/${customerId}/statement`).set(auth()).expect(200);
    expect(customerStatement.body.closingBalance).toBe('100.00');
    const supplierStatement = await http.get(`/suppliers/${supplierId}/statement`).set(auth()).expect(200);
    expect(supplierStatement.body.closingBalance).toBe('250.00');

    const tb = await http.get('/accounting/reports/trial-balance').set(auth()).expect(200);
    expect(tb.body.balanced).toBe(true);
  });
});
