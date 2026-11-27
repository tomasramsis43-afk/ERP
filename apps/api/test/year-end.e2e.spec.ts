import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const uid = () => Math.random().toString(36).slice(2, 12);

d('year-end closing (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let rep: string;
  const id: Record<string, string> = {};
  // A random historical year keeps the test away from the seeded current period and from re-runs.
  const year = 1100 + Math.floor(Math.random() * 800);
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function login(email: string, password: string) {
    return (await http.post('/auth/login').send({ email, password }).expect(200)).body.accessToken as string;
  }
  async function userWithRole(role: string): Promise<string> {
    const email = `${role.toLowerCase()}-${uid()}@test.local`;
    await http.post('/users').set(bearer(admin)).send({ email, fullName: role, password: 'long-password-123', roleCodes: [role] }).expect(201);
    return login(email, 'long-password-123');
  }
  async function tbNet(code: string, asOf: string): Promise<number> {
    const r = await http.get(`/accounting/reports/trial-balance?asOf=${asOf}`).set(bearer(admin)).expect(200);
    const row = r.body.rows.find((x: { code: string }) => x.code === code);
    return row ? Number(row.closingDebit) - Number(row.closingCredit) : 0;
  }
  const incomeProfit = async () =>
    Number((await http.get(`/reports/income-statement?from=${start}&to=${end}`).set(bearer(admin)).expect(200)).body.netProfit);
  async function journal(line1: [string, string, string], line2: [string, string, string], description: string) {
    await http
      .post('/accounting/journal-entries')
      .set(bearer(admin))
      .send({
        entryDate: `${year}-06-15`,
        description,
        post: true,
        lines: [
          { accountId: id[line1[0]], debit: line1[1], credit: line1[2] },
          { accountId: id[line2[0]], debit: line2[1], credit: line2[2] },
        ],
      })
      .expect(201);
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());

    admin = await login(process.env.SEED_ADMIN_EMAIL!, process.env.SEED_ADMIN_PASSWORD!);
    rep = await userWithRole('REPRESENTATIVE');

    const accounts = (await http.get('/accounting/accounts').set(bearer(admin)).expect(200)).body as { id: string; code: string }[];
    for (const code of ['1101', '41', '51', '52', '32', '33']) {
      const a = accounts.find((x) => x.code === code);
      if (!a) throw new Error(`seed account ${code} missing`);
      id[code] = a.id;
    }
    id.period = (await http.post('/fiscal-periods').set(bearer(admin)).send({ name: `FY ${year}`, startDate: start, endDate: end }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('prepares revenue and expenses: profit 500', async () => {
    await journal(['1101', '1000.00', '0'], ['41', '0', '1000.00'], 'sales');
    await journal(['51', '300.00', '0'], ['1101', '0', '300.00'], 'cost of goods');
    await journal(['52', '200.00', '0'], ['1101', '0', '200.00'], 'salaries');
    expect(await incomeProfit()).toBe(500);
  });

  it('preview shows the result and writes nothing', async () => {
    const p = (await http.get(`/accounting/year-end/${id.period}/preview`).set(bearer(admin)).expect(200)).body;
    expect(p.alreadyClosed).toBe(false);
    expect(Number(p.netProfit)).toBe(500);
    expect(p.accounts.map((a: { code: string }) => a.code).sort()).toEqual(['41', '51', '52']);
    expect(await tbNet('32', end)).toBe(0);
  });

  it('requires accounting:approve', async () => {
    await http.post(`/accounting/year-end/${id.period}/close`).set(bearer(rep)).expect(403);
  });

  it('closes revenue and expenses into retained earnings, keeps the books balanced', async () => {
    const retainedBefore = await tbNet('32', end);
    const done = (await http.post(`/accounting/year-end/${id.period}/close`).set(bearer(admin)).expect(201)).body;
    expect(Number(done.netProfit)).toBe(500);
    expect(done.first.source).toBe('YEAR_END_CLOSE');
    expect(done.second).not.toBeNull();

    for (const code of ['41', '51', '52', '33']) expect(await tbNet(code, end)).toBe(0);
    expect(await tbNet('32', end)).toBe(retainedBefore - 500); // credit balance grows by the profit

    const tb = (await http.get(`/accounting/reports/trial-balance?asOf=${end}`).set(bearer(admin)).expect(200)).body;
    expect(tb.balanced).toBe(true);
    const bs = (await http.get(`/reports/balance-sheet?asOf=${end}`).set(bearer(admin)).expect(200)).body;
    expect(bs.balanced).toBe(true);
  });

  it('the income statement of the closed period still shows its result', async () => {
    expect(await incomeProfit()).toBe(500);
  });

  it('cannot be closed twice', async () => {
    await http.post(`/accounting/year-end/${id.period}/close`).set(bearer(admin)).expect(409);
    const p = (await http.get(`/accounting/year-end/${id.period}/preview`).set(bearer(admin)).expect(200)).body;
    expect(p.alreadyClosed).toBe(true);
  });

  it('refuses a period with nothing to close', async () => {
    const y2 = year + 1;
    const empty = (await http.post('/fiscal-periods').set(bearer(admin)).send({ name: `FY ${y2}`, startDate: `${y2}-01-01`, endDate: `${y2}-12-31` }).expect(201)).body.id;
    await http.post(`/accounting/year-end/${empty}/close`).set(bearer(admin)).expect(400);
  });
});
