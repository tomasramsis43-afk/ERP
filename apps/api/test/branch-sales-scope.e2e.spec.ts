import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const uid = () => Math.random().toString(36).slice(2, 10);
const today = new Date().toISOString().slice(0, 10);

d('sales invoices are scoped to the caller branch (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let seller: string;
  let ownInvoice: string;
  let otherInvoice: string;
  let ownWarehouse: string;
  let otherWarehouse: string;
  let customerId: string;
  let productId: string;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const post = (url: string, body: object, t = admin) => http.post(url).set(bearer(t)).send(body);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());
    admin = (await http.post('/auth/login').send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD }).expect(200)).body.accessToken;

    const s = uid();
    const branchA = (await post('/branches', { code: `A-${s}`, nameAr: 'فرع أ', nameEn: 'Branch A', address: 'x' }).expect(201)).body.id;
    const branchB = (await post('/branches', { code: `B-${s}`, nameAr: 'فرع ب', nameEn: 'Branch B', address: 'y' }).expect(201)).body.id;
    const unitId = (await post('/units', { code: `U-${s}`, nameAr: 'قطعة', nameEn: 'Piece' }).expect(201)).body.id;
    productId = (await post('/products', { code: `P-${s}`, nameAr: 'صنف', nameEn: 'Item', baseUnitId: unitId, retailPrice: '20', wholesalePrice: '15' }).expect(201)).body.id;
    customerId = (await post('/customers', { code: `C-${s}`, nameAr: 'عميل', creditLimit: '100000' }).expect(201)).body.id;
    const supplierId = (await post('/suppliers', { code: `S-${s}`, nameAr: 'مورد' }).expect(201)).body.id;
    ownWarehouse = (await post('/warehouses', { code: `WA-${s}`, nameAr: 'مخزن أ', nameEn: 'Store A', type: 'MAIN', branchId: branchA }).expect(201)).body.id;
    otherWarehouse = (await post('/warehouses', { code: `WB-${s}`, nameAr: 'مخزن ب', nameEn: 'Store B', type: 'MAIN', branchId: branchB }).expect(201)).body.id;
    for (const warehouseId of [ownWarehouse, otherWarehouse]) {
      await post('/purchases/invoices', { idempotencyKey: `pur-${uid()}`, invoiceDate: today, supplierId, warehouseId, paymentKind: 'CREDIT', lines: [{ productId, quantity: '20', unitPrice: '10' }] }).expect(201);
    }
    const sell = async (warehouseId: string) =>
      (await post('/sales/invoices', { idempotencyKey: `s-${uid()}`, invoiceDate: today, paymentKind: 'CREDIT', customerId, warehouseId, lines: [{ productId, quantity: '1' }] }).expect(201)).body.id as string;
    ownInvoice = await sell(ownWarehouse);
    otherInvoice = await sell(otherWarehouse);

    const email = `seller-${s}@example.com`;
    await post('/users', { email, fullName: 'Branch A Seller', password: 'Test12345!', roleCodes: ['SALES_MANAGER'], branchId: branchA }).expect(201);
    seller = (await http.post('/auth/login').send({ email, password: 'Test12345!' }).expect(200)).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists only invoices issued from the caller branch', async () => {
    const res = await http.get('/sales/invoices?pageSize=100').set(bearer(seller)).expect(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(ownInvoice);
    expect(ids).not.toContain(otherInvoice);
  });

  it('reads an own-branch invoice but gets 404 for another branch (no id probing)', async () => {
    await http.get(`/sales/invoices/${ownInvoice}`).set(bearer(seller)).expect(200);
    await http.get(`/sales/invoices/${otherInvoice}`).set(bearer(seller)).expect(404);
  });

  it('cannot issue an invoice from another branch warehouse, but can from its own', async () => {
    const body = (warehouseId: string) => ({ idempotencyKey: `s-${uid()}`, invoiceDate: today, paymentKind: 'CREDIT', customerId, warehouseId, lines: [{ productId, quantity: '1' }] });
    await post('/sales/invoices', body(otherWarehouse), seller).expect(403);
    await post('/sales/invoices', body(ownWarehouse), seller).expect(201);
  });

  it('system administrators still see every branch', async () => {
    const res = await http.get('/sales/invoices?pageSize=100').set(bearer(admin)).expect(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining([ownInvoice, otherInvoice]));
  });
});
