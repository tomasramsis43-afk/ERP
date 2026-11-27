import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const uid = () => Math.random().toString(36).slice(2, 10);
const day = (offset: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + offset);
  return dt.toISOString().slice(0, 10);
};

d('batches and FEFO expiry consumption (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let token: string;
  let productId: string;
  let warehouseId: string;
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

    const s = uid();
    const unitId = (await http.post('/units').set(auth()).send({ code: `U-${s}`, nameAr: 'قطعة', nameEn: 'Piece' }).expect(201)).body.id;
    warehouseId = (await http.post('/warehouses').set(auth()).send({ code: `W-${s}`, nameAr: 'مخزن', nameEn: 'Main', type: 'MAIN' }).expect(201)).body.id;
    productId = (
      await http
        .post('/products')
        .set(auth())
        .send({ code: `P-${s}`, nameAr: 'صنف', nameEn: 'Item', baseUnitId: unitId, retailPrice: '10' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('records batch/expiry on inbound layers and exposes an expiry watch list', async () => {
    await http
      .post('/inventory/opening-stock')
      .set(auth())
      .send({
        date: day(0),
        warehouseId,
        lines: [
          { productId, quantity: '10', unitCost: '10', batchNo: 'SOON', expiryDate: day(30) },
          { productId, quantity: '10', unitCost: '12', batchNo: 'LATER', expiryDate: day(90) },
        ],
      })
      .expect(201);

    const all = await http.get(`/inventory/batches?warehouseId=${warehouseId}&productId=${productId}`).set(auth()).expect(200);
    expect(all.body.total).toBe(2);
    expect(all.body.items.map((x: { batchNo: string }) => x.batchNo)).toEqual(['SOON', 'LATER']);

    const soon = await http
      .get(`/inventory/batches?warehouseId=${warehouseId}&productId=${productId}&expiringWithinDays=60`)
      .set(auth())
      .expect(200);
    expect(soon.body.items.map((x: { batchNo: string }) => x.batchNo)).toEqual(['SOON']);
  });

  it('a sale consumes the earliest-expiring layer first (FEFO)', async () => {
    await http
      .post('/sales/invoices')
      .set(auth())
      .send({
        idempotencyKey: `fefo-${uid()}`,
        invoiceDate: day(0),
        paymentKind: 'CASH',
        warehouseId,
        lines: [{ productId, quantity: '10' }],
      })
      .expect(201);

    const left = await http.get(`/inventory/batches?warehouseId=${warehouseId}&productId=${productId}`).set(auth()).expect(200);
    expect(left.body.items).toHaveLength(1);
    expect(left.body.items[0].batchNo).toBe('LATER');
    expect(Number(left.body.items[0].remaining)).toBe(10);
  });
});
