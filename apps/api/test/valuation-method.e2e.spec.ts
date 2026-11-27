import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);

d('inventory valuation method (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let token: string;
  let productId: string;
  let warehouseId: string;
  let previous: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const setMethod = (value: string) =>
    http.put('/settings').set(auth()).send({ settings: [{ key: 'inventory.valuationMethod', value }] }).expect(200);
  const row = async () => {
    const res = await http.get(`/reports/inventory/valuation?warehouseId=${warehouseId}`).set(auth()).expect(200);
    return res.body.rows.find((r: { productId: string }) => r.productId === productId);
  };

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

    const settings = (await http.get('/settings').set(auth()).expect(200)).body;
    previous = settings.find((s: { key: string }) => s.key === 'inventory.valuationMethod')?.value ?? 'WEIGHTED_AVERAGE';

    const s = uid();
    const unitId = (await http.post('/units').set(auth()).send({ code: `U-${s}`, nameAr: 'قطعة', nameEn: 'Piece' }).expect(201)).body.id;
    warehouseId = (await http.post('/warehouses').set(auth()).send({ code: `W-${s}`, nameAr: 'مخزن', nameEn: 'Main', type: 'MAIN' }).expect(201)).body.id;
    productId = (
      await http
        .post('/products')
        .set(auth())
        .send({ code: `P-${s}`, nameAr: 'صنف', nameEn: 'Item', baseUnitId: unitId, retailPrice: '25' })
        .expect(201)
    ).body.id;

    await http
      .post('/inventory/opening-stock')
      .set(auth())
      .send({
        date: today(),
        warehouseId,
        lines: [
          { productId, quantity: '10', unitCost: '10' },
          { productId, quantity: '10', unitCost: '20' },
        ],
      })
      .expect(201);
    // FEFO/FIFO consumes the 10-cost layer, leaving 10 units whose layers cost 20
    // while the product's weighted average remains 15.
    await http
      .post('/sales/invoices')
      .set(auth())
      .send({
        idempotencyKey: `val-${uid()}`,
        invoiceDate: today(),
        paymentKind: 'CASH',
        warehouseId,
        lines: [{ productId, quantity: '10' }],
      })
      .expect(201);
  });

  afterAll(async () => {
    await setMethod(previous);
    await app.close();
  });

  it('values remaining stock with the weighted average by default and with cost layers under FIFO', async () => {
    await setMethod('WEIGHTED_AVERAGE');
    const weighted = await row();
    expect(Number(weighted.quantity)).toBe(10);
    expect(Number(weighted.value)).toBe(150);
    expect(weighted.method).toBe('WEIGHTED_AVERAGE');

    await setMethod('FIFO');
    const fifo = await row();
    expect(Number(fifo.value)).toBe(200);
    expect(fifo.method).toBe('FIFO');
    expect(Number(fifo.layerQuantity)).toBe(10);
    expect(Number(fifo.valuationCost)).toBe(20);
  });
});
