import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 12);

d('cash box day closing (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let rep: string;
  let boxId: string; // opening 1000
  let bankId: string;
  let expenseId: string;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const yesterday = iso(-1);
  const today = iso(0);
  const balanced = async () => (await http.get('/accounting/reports/trial-balance').set(bearer(admin)).expect(200)).body.balanced;
  const balanceOf = async (id: string) => Number((await http.get(`/financial-accounts/${id}`).set(bearer(admin)).expect(200)).body.balance);
  const voucher = (over: Record<string, unknown>) => ({ idempotencyKey: `v-${uid()}`, date: today, description: 'closing test', ...over });

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
    boxId = (await http.post('/financial-accounts').set(bearer(admin)).send({ code: `CB-${s}`, kind: 'CASHBOX', nameAr: 'خزينة', nameEn: 'Closing box', openingBalance: '1000' }).expect(201)).body.id;
    bankId = (await http.post('/financial-accounts').set(bearer(admin)).send({ code: `CK-${s}`, kind: 'BANK', nameAr: 'بنك', nameEn: 'Bank', bankName: 'Test', openingBalance: '100' }).expect(201)).body.id;
    const accounts = (await http.get('/accounting/accounts').set(bearer(admin)).expect(200)).body as { code: string; id: string }[];
    expenseId = accounts.find((a) => a.code === '57')!.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('only users with treasury:approve can close a day', async () => {
    await http.post('/treasury/cashbox-closings').set(bearer(rep)).send({ financialAccountId: boxId, date: yesterday, countedAmount: '1000' }).expect(403);
  });

  it('bank accounts cannot be closed this way', async () => {
    await http.post('/treasury/cashbox-closings').set(bearer(admin)).send({ financialAccountId: bankId, date: yesterday, countedAmount: '100' }).expect(400);
  });

  it('preview shows the ledger balance as of the day', async () => {
    const p = await http.get(`/treasury/cashbox-closings/preview?financialAccountId=${boxId}&date=${yesterday}`).set(bearer(admin)).expect(200);
    expect(p.body.systemBalance).toBe('1000.00');
    expect(p.body.lastClosedDate).toBeNull();
  });

  it('a matching count closes the day with no entry; a second close of the same day conflicts', async () => {
    const c = await http.post('/treasury/cashbox-closings').set(bearer(admin)).send({ financialAccountId: boxId, date: yesterday, countedAmount: '1000' }).expect(201);
    expect(c.body.difference).toBe('0');
    expect(c.body.journalEntryId).toBeNull();
    await http.post('/treasury/cashbox-closings').set(bearer(admin)).send({ financialAccountId: boxId, date: yesterday, countedAmount: '1000' }).expect(409);
  });

  it('a closed day is frozen for vouchers on that day, later days stay open', async () => {
    await http.post('/treasury/vouchers').set(bearer(admin)).send(voucher({ type: 'PAYMENT', amount: '10', date: yesterday, financialAccountId: boxId, counterAccountId: expenseId })).expect(409);
    await http.post('/treasury/vouchers').set(bearer(admin)).send(voucher({ type: 'PAYMENT', amount: '100', financialAccountId: boxId, counterAccountId: expenseId })).expect(201);
    expect(await balanceOf(boxId)).toBe(900);
  });

  it('a shortage needs a reason and is posted so the ledger equals the count', async () => {
    const body = { financialAccountId: boxId, date: today, countedAmount: '880' };
    await http.post('/treasury/cashbox-closings').set(bearer(admin)).send(body).expect(400); // 20 short, no reason
    const c = await http.post('/treasury/cashbox-closings').set(bearer(admin)).send({ ...body, reason: 'Change given by mistake' }).expect(201);
    expect(Number(c.body.systemBalance)).toBe(900);
    expect(Number(c.body.difference)).toBe(-20);
    expect(c.body.journalEntryId).toBeTruthy();
    expect(await balanceOf(boxId)).toBe(880);
    expect(await balanced()).toBe(true);
  });

  it('only the newest closing can be reopened, and reopening restores the ledger balance', async () => {
    const list = await http.get(`/treasury/cashbox-closings?financialAccountId=${boxId}&status=POSTED`).set(bearer(admin)).expect(200);
    const [newest, older] = list.body.items; // newest first
    await http.post(`/treasury/cashbox-closings/${older.id}/reopen`).set(bearer(admin)).send({ reason: 'wrong order' }).expect(409);
    await http.post(`/treasury/cashbox-closings/${newest.id}/reopen`).set(bearer(admin)).send({ reason: 'Recount' }).expect(201);
    expect(await balanceOf(boxId)).toBe(900);
    await http.post(`/treasury/cashbox-closings/${newest.id}/reopen`).set(bearer(admin)).send({ reason: 'again' }).expect(409);
    expect(await balanced()).toBe(true);
    // the day can be closed again after reopening
    await http.post('/treasury/cashbox-closings').set(bearer(admin)).send({ financialAccountId: boxId, date: today, countedAmount: '900' }).expect(201);
  });
});
