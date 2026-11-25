import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JournalPostingService } from '../src/modules/accounting/journal/journal-posting.service';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const today = new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 12);

d('treasury, cheques and bank reconciliation (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let rep: string;
  let boxId: string; // opening 1000
  let boxId2: string; // opening 1000, used for the overdraw race
  let bankId: string; // opening 5000
  let customerId: string;
  let supplierId: string;
  let acc: Record<string, string>;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const num = (v: string) => Number(v);

  const balanceOf = async (id: string) => num((await http.get(`/financial-accounts/${id}`).set(bearer(admin)).expect(200)).body.balance);
  const customerBal = async () => num((await http.get(`/customers/${customerId}`).set(bearer(admin)).expect(200)).body.balance);
  const supplierBal = async () => num((await http.get(`/suppliers/${supplierId}`).set(bearer(admin)).expect(200)).body.balance);
  const balanced = async () => (await http.get('/accounting/reports/trial-balance').set(bearer(admin)).expect(200)).body.balanced;
  async function tb(code: string): Promise<number> {
    const r = await http.get('/accounting/reports/trial-balance').set(bearer(admin)).expect(200);
    const row = r.body.rows.find((x: { code: string }) => x.code === code);
    return row ? num(row.closingDebit) - num(row.closingCredit) : 0;
  }
  const voucher = (over: Record<string, unknown>) => ({
    idempotencyKey: `v-${uid()}`,
    date: today,
    description: 'test voucher',
    ...over,
  });

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
    boxId = (await http.post('/financial-accounts').set(bearer(admin)).send({ code: `B1-${s}`, kind: 'CASHBOX', nameAr: 'خزينة', nameEn: 'Box 1', openingBalance: '1000' }).expect(201)).body.id;
    boxId2 = (await http.post('/financial-accounts').set(bearer(admin)).send({ code: `B2-${s}`, kind: 'CASHBOX', nameAr: 'خزينة', nameEn: 'Box 2', openingBalance: '1000' }).expect(201)).body.id;
    bankId = (await http.post('/financial-accounts').set(bearer(admin)).send({ code: `BK-${s}`, kind: 'BANK', nameAr: 'بنك', nameEn: 'Bank', bankName: 'Test Bank', openingBalance: '5000' }).expect(201)).body.id;
    customerId = (await http.post('/customers').set(bearer(admin)).send({ code: `C-${s}`, nameAr: 'عميل' }).expect(201)).body.id;
    supplierId = (await http.post('/suppliers').set(bearer(admin)).send({ code: `S-${s}`, nameAr: 'مورد' }).expect(201)).body.id;

    const accounts = (await http.get('/accounting/accounts').set(bearer(admin)).expect(200)).body as { code: string; id: string }[];
    acc = Object.fromEntries(accounts.map((a) => [a.code, a.id]));

    // Give the customer a 1000 debt and the supplier a 600 payable via the shared posting service.
    const posting = app.get(JournalPostingService);
    const day = new Date(`${today}T00:00:00.000Z`);
    await posting.post({
      entryDate: day, description: 'customer debt', source: 'TEST',
      lines: [
        { accountId: acc['12'], debit: '1000', credit: 0, partyType: 'CUSTOMER', partyId: customerId },
        { accountId: acc['41'], debit: 0, credit: '1000' },
      ],
    });
    await posting.post({
      entryDate: day, description: 'supplier payable', source: 'TEST',
      lines: [
        { accountId: acc['57'], debit: '600', credit: 0 },
        { accountId: acc['21'], debit: 0, credit: '600', partyType: 'SUPPLIER', partyId: supplierId },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates cash boxes and banks with opening balances posted to their own GL accounts', async () => {
    expect(await balanceOf(boxId)).toBe(1000);
    expect(await balanceOf(bankId)).toBe(5000);
    expect(await balanced()).toBe(true);
  });

  it('only users with treasury permission can move money', async () => {
    await http.post('/treasury/vouchers').set(bearer(rep)).send(voucher({ type: 'RECEIPT', amount: '10', financialAccountId: boxId, partyType: 'CUSTOMER', partyId: customerId })).expect(403);
  });

  let receiptId: string;
  it('customer receipt reduces the receivable and increases the cash box', async () => {
    const r = await http.post('/treasury/vouchers').set(bearer(admin)).send(voucher({ type: 'RECEIPT', amount: '300', financialAccountId: boxId, partyType: 'CUSTOMER', partyId: customerId })).expect(201);
    receiptId = r.body.id;
    expect(await balanceOf(boxId)).toBe(1300);
    expect(await customerBal()).toBe(700);
  });

  it('validates voucher shape', async () => {
    const base = { type: 'PAYMENT', amount: '10', financialAccountId: boxId };
    await http.post('/treasury/vouchers').set(bearer(admin)).send(voucher(base)).expect(400); // no party and no counter account
    await http.post('/treasury/vouchers').set(bearer(admin)).send(voucher({ ...base, partyType: 'SUPPLIER', partyId: supplierId, counterAccountId: acc['57'] })).expect(400); // both
    await http.post('/treasury/vouchers').set(bearer(admin)).send(voucher({ type: 'TRANSFER', amount: '10', financialAccountId: boxId, toFinancialAccountId: boxId })).expect(400);
    await http.post('/treasury/vouchers').set(bearer(admin)).send(voucher({ type: 'PAYMENT', amount: '0', financialAccountId: boxId, counterAccountId: acc['57'] })).expect(400);
    await http.post('/treasury/vouchers').set(bearer(admin)).send(voucher({ type: 'PAYMENT', amount: '10', financialAccountId: boxId, counterAccountId: acc['1101'] })).expect(400); // money account as counter
  });

  it('supplier payment and expense payment reduce the cash box', async () => {
    await http.post('/treasury/vouchers').set(bearer(admin)).send(voucher({ type: 'PAYMENT', amount: '200', financialAccountId: boxId, partyType: 'SUPPLIER', partyId: supplierId })).expect(201);
    expect(await supplierBal()).toBe(400);
    const exp0 = await tb('57');
    await http.post('/treasury/vouchers').set(bearer(admin)).send(voucher({ type: 'PAYMENT', amount: '50', financialAccountId: boxId, counterAccountId: acc['57'] })).expect(201);
    expect(await tb('57')).toBeCloseTo(exp0 + 50, 2);
    expect(await balanceOf(boxId)).toBe(1050);
  });

  it('a cash box can never go negative, even under concurrent payments', async () => {
    const attempts = Array.from({ length: 5 }, () =>
      http.post('/treasury/vouchers').set(bearer(admin)).send(voucher({ type: 'PAYMENT', amount: '400', financialAccountId: boxId2, counterAccountId: acc['57'] })),
    );
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r.status === 201)).toHaveLength(2); // 1000 / 400
    expect(results.filter((r) => r.status === 400)).toHaveLength(3);
    expect(await balanceOf(boxId2)).toBe(200);
  });

  it('transfers move money between accounts and a duplicate operation applies once', async () => {
    const body = voucher({ type: 'TRANSFER', amount: '300', financialAccountId: boxId, toFinancialAccountId: bankId, idempotencyKey: `t-${uid()}` });
    const results = await Promise.all(Array.from({ length: 4 }, () => http.post('/treasury/vouchers').set(bearer(admin)).send(body)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await balanceOf(boxId)).toBe(750);
    expect(await balanceOf(bankId)).toBe(5300);
    expect(await balanced()).toBe(true);
  });

  it('cancelling a receipt restores balances once; a cancel that would overdraw the cash box is refused', async () => {
    await http.post(`/treasury/vouchers/${receiptId}/cancel`).set(bearer(admin)).send({ reason: 'wrong customer' }).expect(201);
    expect(await customerBal()).toBe(1000);
    expect(await balanceOf(boxId)).toBe(450);
    await http.post(`/treasury/vouchers/${receiptId}/cancel`).set(bearer(admin)).send({ reason: 'again' }).expect(409);

    // Take almost everything out, then try to cancel a receipt that is larger than what is left.
    const big = await http.post('/treasury/vouchers').set(bearer(admin)).send(voucher({ type: 'RECEIPT', amount: '100', financialAccountId: boxId, partyType: 'CUSTOMER', partyId: customerId })).expect(201);
    await http.post('/treasury/vouchers').set(bearer(admin)).send(voucher({ type: 'PAYMENT', amount: '550', financialAccountId: boxId, counterAccountId: acc['57'] })).expect(201);
    expect(await balanceOf(boxId)).toBe(0);
    await http.post(`/treasury/vouchers/${big.body.id}/cancel`).set(bearer(admin)).send({ reason: 'no funds' }).expect(400);
    expect(await balanceOf(boxId)).toBe(0);
    expect(await balanced()).toBe(true);
  });

  const cheque = (over: Record<string, unknown> = {}) => ({
    idempotencyKey: `c-${uid()}`,
    chequeNumber: `CH-${uid()}`,
    bankName: 'Customer Bank',
    receivedDate: today,
    dueDate: today,
    amount: '500',
    customerId,
    ...over,
  });

  it('incoming cheque: receive, collect into the bank, and cannot be settled twice', async () => {
    const cust0 = await customerBal();
    const under0 = await tb('1103');
    const bank0 = await balanceOf(bankId);
    const c = await http.post('/treasury/cheques/incoming').set(bearer(admin)).send(cheque()).expect(201);
    expect(await customerBal()).toBe(cust0 - 500);
    expect(await tb('1103')).toBeCloseTo(under0 + 500, 2);

    await http.post(`/treasury/cheques/${c.body.id}/settle`).set(bearer(admin)).send({ date: today, financialAccountId: bankId }).expect(201);
    expect(await balanceOf(bankId)).toBe(bank0 + 500);
    expect(await tb('1103')).toBeCloseTo(under0, 2);
    await http.post(`/treasury/cheques/${c.body.id}/settle`).set(bearer(admin)).send({ date: today, financialAccountId: bankId }).expect(409);
    await http.post(`/treasury/cheques/${c.body.id}/bounce`).set(bearer(admin)).send({ date: today, reason: 'late' }).expect(409);
    expect(await balanced()).toBe(true);
  });

  it('incoming cheque that bounces puts the debt back on the customer', async () => {
    const cust0 = await customerBal();
    const c = await http.post('/treasury/cheques/incoming').set(bearer(admin)).send(cheque({ amount: '120' })).expect(201);
    expect(await customerBal()).toBe(cust0 - 120);
    await http.post(`/treasury/cheques/${c.body.id}/bounce`).set(bearer(admin)).send({ date: today, reason: 'insufficient funds' }).expect(201);
    expect(await customerBal()).toBe(cust0);
  });

  it('racing settle and bounce on one cheque: exactly one wins', async () => {
    const c = await http.post('/treasury/cheques/incoming').set(bearer(admin)).send(cheque({ amount: '80' })).expect(201);
    const [a, b] = await Promise.all([
      http.post(`/treasury/cheques/${c.body.id}/settle`).set(bearer(admin)).send({ date: today, financialAccountId: bankId }),
      http.post(`/treasury/cheques/${c.body.id}/bounce`).set(bearer(admin)).send({ date: today, reason: 'race' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await balanced()).toBe(true);
  });

  it('outgoing cheque: issue reduces the supplier balance, clearing draws on the bank', async () => {
    const sup0 = await supplierBal();
    const bank0 = await balanceOf(bankId);
    const c = await http
      .post('/treasury/cheques/outgoing')
      .set(bearer(admin))
      .send({ idempotencyKey: `o-${uid()}`, chequeNumber: `OUT-${uid()}`, issueDate: today, dueDate: today, amount: '250', supplierId, financialAccountId: bankId })
      .expect(201);
    expect(await supplierBal()).toBe(sup0 - 250);
    expect(await balanceOf(bankId)).toBe(bank0); // nothing leaves the bank until it clears
    await http.post(`/treasury/cheques/${c.body.id}/settle`).set(bearer(admin)).send({ date: today }).expect(201);
    expect(await balanceOf(bankId)).toBe(bank0 - 250);
    expect(await balanced()).toBe(true);
  });

  it('bank reconciliation requires an exact match with the statement and each line can be reconciled once', async () => {
    const lines = await http.get(`/banks/${bankId}/unreconciled?pageSize=500`).set(bearer(admin)).expect(200);
    const ids = lines.body.items.map((l: { id: string }) => l.id);
    expect(ids.length).toBeGreaterThan(0);
    const ledger = await balanceOf(bankId);

    await http.post(`/banks/${bankId}/reconcile`).set(bearer(admin)).send({ statementDate: today, statementBalance: String(ledger + 1), journalLineIds: ids }).expect(400);
    const ok = await http.post(`/banks/${bankId}/reconcile`).set(bearer(admin)).send({ statementDate: today, statementBalance: String(ledger), journalLineIds: ids }).expect(201);
    expect(ok.body.lines).toBe(ids.length);
    await http.post(`/banks/${bankId}/reconcile`).set(bearer(admin)).send({ statementDate: today, statementBalance: String(ledger), journalLineIds: ids }).expect(400);
    const after = await http.get(`/banks/${bankId}/unreconciled`).set(bearer(admin)).expect(200);
    expect(after.body.total).toBe(0);
    expect(num(after.body.reconciledBalance)).toBe(ledger);
  });
});
