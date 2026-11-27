import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const today = new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);

d('product min/max levels and the stock level reports (requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let unitId: string;
  let warehouseId: string;
  let supplierId: string;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const levels = { minLevel: '5', reorderLevel: '10', maxLevel: '100' };

  const newProduct = (over: Record<string, unknown> = {}) =>
    http.post('/products').set(bearer(admin)).send({ code: `P-${uid()}`, nameAr: 'صنف', nameEn: 'Item', baseUnitId: unitId, ...over });
  /** Creates a product with the given levels and buys `qty` units at 10 into the test warehouse. */
  const stocked = async (qty: string | null, over: Record<string, unknown> = {}) => {
    const id = (await newProduct(over).expect(201)).body.id as string;
    if (qty) {
      await http
        .post('/purchases/invoices')
        .set(bearer(admin))
        .send({ idempotencyKey: `p-${uid()}`, invoiceDate: today, supplierId, warehouseId, paymentKind: 'CREDIT', lines: [{ productId: id, quantity: qty, unitPrice: '10' }] })
        .expect(201);
    }
    return id;
  };
  const low = async () => (await http.get(`/reports/inventory/low-stock?warehouseId=${warehouseId}`).set(bearer(admin)).expect(200)).body as Record<string, any>[];
  const over = async () => (await http.get(`/reports/inventory/overstock?warehouseId=${warehouseId}`).set(bearer(admin)).expect(200)).body as Record<string, any>[];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());
    admin = (await http.post('/auth/login').send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD }).expect(200)).body.accessToken;

    const s = uid();
    unitId = (await http.post('/units').set(bearer(admin)).send({ code: `U-${s}`, nameAr: 'قطعة', nameEn: 'Piece' }).expect(201)).body.id;
    warehouseId = (await http.post('/warehouses').set(bearer(admin)).send({ code: `W-${s}`, nameAr: 'رئيسي', nameEn: 'Main', type: 'MAIN' }).expect(201)).body.id;
    supplierId = (await http.post('/suppliers').set(bearer(admin)).send({ code: `S-${s}`, nameAr: 'مورد' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('stores the levels and defaults them to 0 (not set)', async () => {
    const withLevels = (await newProduct(levels).expect(201)).body;
    expect(Number(withLevels.minLevel)).toBe(5);
    expect(Number(withLevels.reorderLevel)).toBe(10);
    expect(Number(withLevels.maxLevel)).toBe(100);
    const bare = (await newProduct().expect(201)).body;
    expect(Number(bare.minLevel)).toBe(0);
    expect(Number(bare.maxLevel)).toBe(0);
  });

  it('rejects a ceiling below the safety stock or the reorder level, on create and on update', async () => {
    await newProduct({ reorderLevel: '10', maxLevel: '8' }).expect(400);
    await newProduct({ minLevel: '20', maxLevel: '15' }).expect(400);
    await newProduct({ minLevel: '-1' }).expect(400);

    const id = (await newProduct(levels).expect(201)).body.id as string;
    // lowering only the ceiling must be checked against the stored reorder level
    await http.patch(`/products/${id}`).set(bearer(admin)).send({ maxLevel: '9' }).expect(400);
    // raising the minimum above the stored ceiling is rejected too
    await http.patch(`/products/${id}`).set(bearer(admin)).send({ minLevel: '150' }).expect(400);
    const ok = (await http.patch(`/products/${id}`).set(bearer(admin)).send({ maxLevel: '0' }).expect(200)).body; // 0 clears the ceiling
    expect(Number(ok.maxLevel)).toBe(0);
  });

  it('low-stock flags below-minimum separately from at-reorder, and ignores healthy stock', async () => {
    const belowMin = await stocked('4', levels); // 4 < min 5 (and below reorder 10)
    const atReorder = await stocked('7', levels); // above min, below reorder 10
    const healthy = await stocked('50', levels);
    const minOnly = await stocked('6', { minLevel: '8' }); // no reorder level: min alone triggers it
    const noLevels = await stocked('1');

    const rows = await low();
    const by = (id: string) => rows.find((r) => r.productId === id);

    expect(by(belowMin)?.belowMin).toBe(true);
    expect(Number(by(belowMin)?.shortfall)).toBe(6); // 10 - 4, measured against the higher threshold
    expect(by(atReorder)?.belowMin).toBe(false);
    expect(Number(by(atReorder)?.shortfall)).toBe(3);
    expect(by(minOnly)?.belowMin).toBe(true);
    expect(Number(by(minOnly)?.shortfall)).toBe(2); // 8 - 6
    expect(by(healthy)).toBeUndefined();
    expect(by(noLevels)).toBeUndefined();
  });

  it('overstock lists only products above their ceiling, valued at the average cost', async () => {
    const above = await stocked('150', levels);
    const atCeiling = await stocked('100', levels); // exactly at the ceiling is not over
    const noCeiling = await stocked('500'); // maxLevel 0 means unlimited

    const rows = await over();
    const hit = rows.find((r) => r.productId === above);
    expect(hit).toBeDefined();
    expect(Number(hit!.excess)).toBe(50);
    expect(Number(hit!.excessValue)).toBe(500); // 50 x average cost 10
    expect(rows.find((r) => r.productId === atCeiling)).toBeUndefined();
    expect(rows.find((r) => r.productId === noCeiling)).toBeUndefined();
  });

  it('the reports need the reports permission', async () => {
    const email = `u-${uid()}@test.local`;
    await http.post('/users').set(bearer(admin)).send({ email, fullName: 'Rep', password: 'long-password-123', roleCodes: ['REPRESENTATIVE'] }).expect(201);
    const rep = (await http.post('/auth/login').send({ email, password: 'long-password-123' }).expect(200)).body.accessToken;
    await http.get('/reports/inventory/overstock').set(bearer(rep)).expect(403);
  });
});
