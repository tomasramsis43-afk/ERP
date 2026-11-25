import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const now = new Date();
const today = now.toISOString().slice(0, 10);
const period = today.slice(0, 7);
const first = `${period}-01`;
const second = `${period}-02`;
const year = now.getUTCFullYear();
const uid = () => Math.random().toString(36).slice(2, 10);
const n = (v: string | number) => Number(v);

d('human resources: employees, attendance, leave, advances and payroll (requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let rep: string;
  let e1: string;
  let e2: string;
  let boxId: string;
  let runId: string;
  let totalNet = 0;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const post = (url: string, body: object, t = admin) => http.post(url).set(bearer(t)).send(body);
  const get = (url: string, t = admin) => http.get(url).set(bearer(t));
  async function tb(code: string): Promise<number> {
    const r = await get('/accounting/reports/trial-balance').expect(200);
    const row = r.body.rows.find((x: { code: string }) => x.code === code);
    return row ? n(row.closingDebit) - n(row.closingCredit) : 0;
  }
  const balanced = async () => (await get('/accounting/reports/trial-balance').expect(200)).body.balanced;
  const boxBalance = async () => n((await get(`/financial-accounts/${boxId}`).expect(200)).body.balance);
  // The distinct days we mark absent for the first employee.
  const absentDays = [...new Set([first, today])];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());
    admin = (await http.post('/auth/login').send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD }).expect(200)).body.accessToken;
    const email = `rep-${uid()}@test.local`;
    await post('/users', { email, fullName: 'Rep', password: 'long-password-123', roleCodes: ['REPRESENTATIVE'] }).expect(201);
    rep = (await http.post('/auth/login').send({ email, password: 'long-password-123' }).expect(200)).body.accessToken;
    boxId = (await post('/financial-accounts', { code: `HRB-${uid()}`, kind: 'CASHBOX', nameAr: 'خزينة', nameEn: 'HR box', openingBalance: '50000' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates employees; codes are unique; non-HR users are refused', async () => {
    const s = uid();
    e1 = (await post('/hr/employees', { code: `E1-${s}`, nameAr: 'موظف أول', hireDate: '2020-01-01', baseSalary: '3000', allowance: '300' }).expect(201)).body.id;
    e2 = (await post('/hr/employees', { code: `E2-${s}`, nameAr: 'موظف ثان', hireDate: '2020-01-01', baseSalary: '3000' }).expect(201)).body.id;
    await post('/hr/employees', { code: `E1-${s}`, nameAr: 'مكرر', hireDate: '2020-01-01', baseSalary: '1' }).expect(409);
    await post('/hr/employees', { code: `E9-${s}`, nameAr: 'سالب', hireDate: '2020-01-01', baseSalary: '-5' }).expect(400);
    await get('/hr/employees', rep).expect(403);
    await post('/hr/employees', { code: `E8-${s}`, nameAr: 'x', hireDate: '2020-01-01', baseSalary: '1' }, rep).expect(403);
  });

  it('attendance: one record per day (re-recording corrects it); no future days; no days before hire', async () => {
    for (const day of absentDays) await post('/hr/attendance', { employeeId: e1, date: day, status: 'ABSENT' }).expect(201);
    await post('/hr/attendance', { employeeId: e1, date: first, status: 'PRESENT' }).expect(201);
    await post('/hr/attendance', { employeeId: e1, date: first, status: 'ABSENT' }).expect(201);
    const m = (await get(`/hr/attendance?period=${period}&employeeId=${e1}`).expect(200)).body;
    expect(m.summary.ABSENT).toBe(absentDays.length);
    expect(m.rows).toHaveLength(absentDays.length);
    await post('/hr/attendance', { employeeId: e1, date: `${year + 1}-01-01`, status: 'PRESENT' }).expect(400);
    await post('/hr/attendance', { employeeId: e1, date: '2019-12-31', status: 'PRESENT' }).expect(400);
  });

  it('annual leave is limited by the balance; overlapping requests are refused; approval marks the days', async () => {
    await post('/hr/leaves', { employeeId: e2, type: 'ANNUAL', fromDate: `${year}-02-01`, toDate: `${year}-02-22` }).expect(400); // 22 days > 21
    const l = (await post('/hr/leaves', { employeeId: e2, type: 'ANNUAL', fromDate: `${year}-02-01`, toDate: `${year}-02-05` }).expect(201)).body;
    expect(l.days).toBe(5);
    await post('/hr/leaves', { employeeId: e2, type: 'SICK', fromDate: `${year}-02-04`, toDate: `${year}-02-06` }).expect(409);
    await post(`/hr/leaves/${l.id}/decide`, { approve: true }, rep).expect(403);
    await post(`/hr/leaves/${l.id}/decide`, { approve: true }).expect(201);
    await post(`/hr/leaves/${l.id}/decide`, { approve: false }).expect(409); // already decided
    const bal = (await get(`/hr/employees/${e2}/leave-balance?year=${year}`).expect(200)).body;
    expect(bal).toMatchObject({ entitled: 21, taken: 5, remaining: 16 });
  });

  it('unpaid leave inside the payroll month is approved and later deducted', async () => {
    const l = (await post('/hr/leaves', { employeeId: e2, type: 'UNPAID', fromDate: first, toDate: second }).expect(201)).body;
    await post(`/hr/leaves/${l.id}/decide`, { approve: true }).expect(201);
  });

  it('an advance is paid from the cash box and registered for deduction; replays pay once', async () => {
    const box0 = await boxBalance();
    const adv0 = await tb('17');
    const body = { idempotencyKey: `adv-${uid()}`, employeeId: e1, amount: '600', monthlyDeduction: '200', date: today, financialAccountId: boxId };
    const [a, b] = await Promise.all([post('/hr/advances', body), post('/hr/advances', body)]);
    expect([200, 201]).toContain(a.status);
    expect([200, 201]).toContain(b.status);
    expect(a.body.id).toBe(b.body.id);
    expect(await boxBalance()).toBeCloseTo(box0 - 600, 2);
    expect(await tb('17')).toBeCloseTo(adv0 + 600, 2);
    await post('/hr/advances', { ...body, idempotencyKey: `adv-${uid()}`, monthlyDeduction: '700' }).expect(400);
    await post('/hr/advances', { ...body, idempotencyKey: `adv-${uid()}`, employeeId: e2 }, rep).expect(403);
    expect(n((await get(`/hr/employees/${e1}`).expect(200)).body.outstandingAdvances)).toBe(600);
  });

  it('payroll posts salaries, recovers the advance installment, and balances', async () => {
    const [sal0, adv0, accrued0] = await Promise.all([tb('52'), tb('17'), tb('23')]);
    const [r1, r2] = await Promise.all([post('/hr/payroll', { period }), post('/hr/payroll', { period })]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const run = (r1.status === 201 ? r1 : r2).body;
    runId = run.id;
    expect(run.lines).toHaveLength(2);

    const l1 = run.lines.find((l: { employeeId: string }) => l.employeeId === e1);
    const l2 = run.lines.find((l: { employeeId: string }) => l.employeeId === e2);
    const absent1 = absentDays.length;
    expect(l1.absentDays).toBe(absent1);
    expect(n(l1.absenceDeduction)).toBeCloseTo(100 * absent1, 2);
    expect(n(l1.advanceDeduction)).toBe(200);
    expect(n(l1.netPay)).toBeCloseTo(3300 - 100 * absent1 - 200, 2);
    expect(l2.absentDays).toBe(2); // two unpaid-leave days
    expect(n(l2.netPay)).toBeCloseTo(3000 - 200, 2);

    totalNet = n(l1.netPay) + n(l2.netPay);
    expect(n(run.totalNet)).toBeCloseTo(totalNet, 2);
    expect(n(run.totalDeductions)).toBe(200);
    expect(await tb('52')).toBeCloseTo(sal0 + totalNet + 200, 2);
    expect(await tb('17')).toBeCloseTo(adv0 - 200, 2);
    expect(await tb('23')).toBeCloseTo(accrued0 - totalNet, 2);
    expect(await balanced()).toBe(true);

    const advances = (await get(`/hr/advances?employeeId=${e1}`).expect(200)).body.items;
    expect(n(advances[0].repaid)).toBe(200);
    expect(advances[0].status).toBe('OPEN');
    expect(n((await get(`/hr/employees/${e1}`).expect(200)).body.outstandingAdvances)).toBe(400);
  });

  it('a posted month is frozen: attendance and leave touching it are refused', async () => {
    await post('/hr/attendance', { employeeId: e1, date: first, status: 'PRESENT' }).expect(400);
    const l = (await post('/hr/leaves', { employeeId: e1, type: 'SICK', fromDate: today, toDate: today }).expect(201)).body;
    await post(`/hr/leaves/${l.id}/decide`, { approve: true }).expect(400);
  });

  it('salaries are paid once from a cash box', async () => {
    const box0 = await boxBalance();
    const body = { financialAccountId: boxId, date: today };
    const first1 = await post(`/hr/payroll/${runId}/pay`, body).expect(201);
    expect(first1.body.status).toBe('PAID');
    await post(`/hr/payroll/${runId}/pay`, body).expect(201); // replay: same voucher, no second payment
    expect(await boxBalance()).toBeCloseTo(box0 - totalNet, 2);
    expect(await balanced()).toBe(true);
    const detail = (await get(`/hr/payroll/${runId}`).expect(200)).body;
    expect(detail.paymentVoucherId).toBe(first1.body.paymentVoucherId);
  });
});
