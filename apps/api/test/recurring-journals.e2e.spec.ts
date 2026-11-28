import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const uid = () => Math.random().toString(36).slice(2, 10);
const today = new Date().toISOString().slice(0, 10);

d('recurring journals (end to end, requires seeded PostgreSQL)', () => {
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

  it('creates a balanced monthly template and posts it idempotently', async () => {
    const accounts = (await http.get('/accounting/accounts').set(auth()).expect(200)).body;
    const cash = accounts.find((a: { code: string }) => a.code === '1101').id;
    const sales = accounts.find((a: { code: string }) => a.code === '41').id;

    const created = await http
      .post('/accounting/recurring')
      .set(auth())
      .send({
        code: `RENT-${uid()}`,
        description: 'Monthly rent accrual',
        frequency: 'MONTHLY',
        dayOfMonth: 1,
        nextRunDate: today,
        lines: [
          { accountId: cash, debit: '100.00', credit: '0.00' },
          { accountId: sales, debit: '0.00', credit: '100.00' },
        ],
      })
      .expect(201);

    const first = await http.post(`/accounting/recurring/${created.body.id}/run?date=${today}`).set(auth()).expect(201);
    expect(first.body.source).toBe('RECURRING');
    const again = await http.post(`/accounting/recurring/${created.body.id}/run?date=${today}`).set(auth()).expect(201);
    expect(again.body.id).toBe(first.body.id);

    const list = await http.get('/accounting/recurring').set(auth()).expect(200);
    const template = list.body.find((t: { id: string }) => t.id === created.body.id);
    expect(template.lastRunDate).not.toBeNull();
    expect(template.nextRunDate).not.toBe(today);

    const unbalanced = await http
      .post('/accounting/recurring')
      .set(auth())
      .send({
        code: `BAD-${uid()}`,
        description: 'Unbalanced template',
        frequency: 'DAILY',
        nextRunDate: today,
        lines: [
          { accountId: cash, debit: '100.00', credit: '0.00' },
          { accountId: sales, debit: '0.00', credit: '90.00' },
        ],
      })
      .expect(400);
    expect(JSON.stringify(unbalanced.body)).toMatch(/not balanced/i);
  });
});
