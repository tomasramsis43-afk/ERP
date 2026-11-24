import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JournalPostingService } from '../src/modules/accounting/journal/journal-posting.service';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const today = new Date().toISOString().slice(0, 10);

d('accounting API (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let adminToken: string;
  let cashId: string;
  let salesId: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const num = (v: string) => Number(v);

  async function login(email: string, password: string): Promise<string> {
    const res = await http.post('/auth/login').send({ email, password }).expect(200);
    return res.body.accessToken as string;
  }

  async function cashClosing(): Promise<number> {
    const res = await http.get('/accounting/reports/trial-balance').set(auth(adminToken)).expect(200);
    const row = res.body.rows.find((r: { code: string }) => r.code === '1101');
    return row ? num(row.closingDebit) - num(row.closingCredit) : 0;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());

    adminToken = await login(process.env.SEED_ADMIN_EMAIL!, process.env.SEED_ADMIN_PASSWORD!);
    const accounts = await http.get('/accounting/accounts').set(auth(adminToken)).expect(200);
    cashId = accounts.body.find((a: { code: string }) => a.code === '1101').id;
    salesId = accounts.body.find((a: { code: string }) => a.code === '41').id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    await http.get('/accounting/accounts').expect(401);
  });

  it('enforces permissions: a representative cannot read the ledger', async () => {
    const email = `rep-${Date.now()}@test.local`;
    await http
      .post('/users')
      .set(auth(adminToken))
      .send({ email, fullName: 'Test Rep', password: 'long-password-123', roleCodes: ['REPRESENTATIVE'] })
      .expect(201);
    const repToken = await login(email, 'long-password-123');
    await http.get('/accounting/accounts').set(auth(repToken)).expect(403);
  });

  it('rejects an unbalanced manual entry', async () => {
    await http
      .post('/accounting/journal-entries')
      .set(auth(adminToken))
      .send({
        entryDate: today,
        description: 'unbalanced',
        post: true,
        lines: [
          { accountId: cashId, debit: '100.00', credit: '0' },
          { accountId: salesId, debit: '0', credit: '99.99' },
        ],
      })
      .expect(400);
  });

  it('posts an entry, keeps the trial balance balanced, and reverses it exactly once', async () => {
    const before = await cashClosing();

    const created = await http
      .post('/accounting/journal-entries')
      .set(auth(adminToken))
      .send({
        entryDate: today,
        description: 'cash sale test',
        post: true,
        lines: [
          { accountId: cashId, debit: '1000.50', credit: '0' },
          { accountId: salesId, debit: '0', credit: '1000.50' },
        ],
      })
      .expect(201);
    expect(created.body.status).toBe('POSTED');

    const mid = await http.get('/accounting/reports/trial-balance').set(auth(adminToken)).expect(200);
    expect(mid.body.balanced).toBe(true);
    expect(await cashClosing()).toBeCloseTo(before + 1000.5, 2);

    const ledger = await http
      .get(`/accounting/reports/ledger/${cashId}?pageSize=200`)
      .set(auth(adminToken))
      .expect(200);
    const last = ledger.body.items[ledger.body.items.length - 1];
    expect(num(last.runningBalance)).toBeCloseTo(before + 1000.5, 2);

    await http
      .post(`/accounting/journal-entries/${created.body.id}/reverse`)
      .set(auth(adminToken))
      .send({ reason: 'test correction' })
      .expect(201);
    expect(await cashClosing()).toBeCloseTo(before, 2);

    await http
      .post(`/accounting/journal-entries/${created.body.id}/reverse`)
      .set(auth(adminToken))
      .send({ reason: 'again' })
      .expect(409);
  });

  it('supports draft then post', async () => {
    const draft = await http
      .post('/accounting/journal-entries')
      .set(auth(adminToken))
      .send({
        entryDate: today,
        description: 'draft entry',
        lines: [
          { accountId: cashId, debit: '5.00', credit: '0' },
          { accountId: salesId, debit: '0', credit: '5.00' },
        ],
      })
      .expect(201);
    expect(draft.body.status).toBe('DRAFT');
    const posted = await http
      .post(`/accounting/journal-entries/${draft.body.id}/post`)
      .set(auth(adminToken))
      .expect(201);
    expect(posted.body.status).toBe('POSTED');
    await http.post(`/accounting/journal-entries/${draft.body.id}/post`).set(auth(adminToken)).expect(409);
  });

  it('posting the same idempotency key twice creates one entry', async () => {
    const posting = app.get(JournalPostingService);
    const input = {
      entryDate: new Date(`${today}T00:00:00.000Z`),
      description: 'idempotent',
      source: 'TEST',
      idempotencyKey: `idem-${Date.now()}`,
      lines: [
        { accountId: cashId, debit: '7.00', credit: 0 },
        { accountId: salesId, debit: 0, credit: '7.00' },
      ],
    };
    const [a, b] = await Promise.all([posting.post(input), posting.post(input)]);
    expect(a.entry.id).toBe(b.entry.id);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
  });

  it('refuses to post to a non-postable (group) account', async () => {
    const accounts = await http.get('/accounting/accounts').set(auth(adminToken)).expect(200);
    const group = accounts.body.find((a: { code: string }) => a.code === '1');
    await http
      .post('/accounting/journal-entries')
      .set(auth(adminToken))
      .send({
        entryDate: today,
        description: 'group posting',
        post: true,
        lines: [
          { accountId: group.id, debit: '1', credit: '0' },
          { accountId: salesId, debit: '0', credit: '1' },
        ],
      })
      .expect(400);
  });
});
