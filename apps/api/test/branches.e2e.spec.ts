import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const uid = () => Math.random().toString(36).slice(2, 10);

d('branch scoping (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let adminToken: string;
  let keeperToken: string;
  let branchId: string;
  let mainBranchId: string;
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });
  const keeper = () => ({ Authorization: `Bearer ${keeperToken}` });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());
    adminToken = (
      await http
        .post('/auth/login')
        .send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD })
        .expect(200)
    ).body.accessToken;

    const existing = (await http.get('/branches?pageSize=100').set(admin()).expect(200)).body.items;
    mainBranchId = existing.find((b: { code: string }) => b.code === 'MAIN')?.id;
    expect(mainBranchId).toBeTruthy();

    const s = uid();
    branchId = (
      await http
        .post('/branches')
        .set(admin())
        .send({ code: `B-${s}`, nameAr: 'فرع اختبار', nameEn: 'Test branch', address: 'Test street' })
        .expect(201)
    ).body.id;

    const email = `keeper-${s}@example.com`;
    const password = 'Test12345!';
    const user = await http
      .post('/users')
      .set(admin())
      .send({ email, fullName: 'Branch Keeper', password, roleCodes: ['WAREHOUSE_KEEPER'], branchId })
      .expect(201);
    expect(user.body.branch.id).toBe(branchId);
    keeperToken = (await http.post('/auth/login').send({ email, password }).expect(200)).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('restricts branch lists and assigns new warehouses to the caller branch', async () => {
    const branches = await http.get('/branches').set(keeper()).expect(200);
    expect(branches.body.items).toHaveLength(1);
    expect(branches.body.items[0].id).toBe(branchId);

    const s = uid();
    const own = await http
      .post('/warehouses')
      .set(keeper())
      .send({ code: `W-${s}`, nameAr: 'مخزن الفرع', nameEn: 'Branch store', type: 'MAIN' })
      .expect(201);
    expect(own.body.branchId).toBe(branchId);

    await http
      .post('/warehouses')
      .set(keeper())
      .send({ code: `X-${s}`, nameAr: 'مخزن آخر', nameEn: 'Other store', type: 'MAIN', branchId: mainBranchId })
      .expect(403);

    const warehouses = await http.get('/warehouses').set(keeper()).expect(200);
    expect(warehouses.body.every((w: { branchId: string | null }) => w.branchId === branchId)).toBe(true);
  });
});
