import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const iso = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const today = iso(0);
const uid = () => Math.random().toString(36).slice(2, 10);

d('route visit plan and visit log (requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let repToken: string;
  let otherToken: string;
  let routeId: string;
  let repId: string;
  const customers: string[] = [];
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = async (email: string, password: string) =>
    (await http.post('/auth/login').send({ email, password }).expect(200)).body.accessToken as string;
  const post = (url: string, body: object, t = admin) => http.post(url).set(bearer(t)).send(body);
  const get = (url: string, t = admin) => http.get(url).set(bearer(t));

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());
    admin = await login(process.env.SEED_ADMIN_EMAIL!, process.env.SEED_ADMIN_PASSWORD!);

    const s = uid();
    const city = (await post('/geo-areas', { level: 'CITY', nameAr: 'مدينة', nameEn: `City ${s}` }).expect(201)).body;
    routeId = (await post('/routes', { code: `RV-${s}`, nameAr: 'خط الزيارات', nameEn: 'Visit route', geoAreaId: city.id }).expect(201)).body.id;
    for (let i = 0; i < 3; i++) {
      customers.push((await post('/customers', { code: `CV${i}-${s}`, nameAr: `عميل ${i}`, creditLimit: '1000', routeId }).expect(201)).body.id);
    }
    const email = `rep-${s}@test.local`;
    const user = (await post('/users', { email, fullName: 'Rep', password: 'long-password-123', roleCodes: ['REPRESENTATIVE'] }).expect(201)).body;
    const vehicle = (await post('/vehicles', { plateNumber: `PV-${s}`, model: 'Van' }).expect(201)).body;
    repId = (await post('/representatives', { code: `RV${s}`.slice(0, 12), nameAr: 'مندوب', userId: user.id, vehicleId: vehicle.id, routeId }).expect(201)).body.id;
    repToken = await login(email, 'long-password-123');
    const other = `acc-${s}@test.local`;
    await post('/users', { email: other, fullName: 'Acc', password: 'long-password-123', roleCodes: ['WAREHOUSE_KEEPER'] }).expect(201);
    otherToken = await login(other, 'long-password-123');
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets the visiting order; every customer must belong to the route', async () => {
    const order = [customers[2], customers[0], customers[1]];
    await http.put(`/routes/${routeId}/sequence`).set(bearer(admin)).send({ customerIds: order }).expect(200);
    const cov = (await get(`/routes/${routeId}/coverage`).expect(200)).body;
    expect(cov.rows.map((r: { customerId: string }) => r.customerId)).toEqual(order);
    expect(cov.rows.map((r: { sequence: number }) => r.sequence)).toEqual([1, 2, 3]);
    await http.put(`/routes/${routeId}/sequence`).set(bearer(admin)).send({ customerIds: [customers[0], customers[0]] }).expect(400);
    const stranger = (await post('/customers', { code: `CS-${uid()}`, nameAr: 'خارج الخط', creditLimit: '0' }).expect(201)).body.id;
    await http.put(`/routes/${routeId}/sequence`).set(bearer(admin)).send({ customerIds: [stranger] }).expect(400);
  });

  it('coverage starts with nobody visited', async () => {
    const cov = (await get(`/routes/${routeId}/coverage?date=${today}`).expect(200)).body;
    expect(cov.total).toBe(3);
    expect(cov.visited).toBe(0);
    expect(cov.notVisited).toBe(3);
  });

  it('a representative logs visits with their own profile; coverage shows visited and not visited', async () => {
    const v = (await post('/routes/visits', { customerId: customers[2], outcome: 'SALE' }, repToken).expect(201)).body;
    expect(v.representativeId).toBe(repId);
    expect(v.routeId).toBe(routeId);
    await post('/routes/visits', { customerId: customers[0], outcome: 'SHOP_CLOSED', note: 'مغلق' }, repToken).expect(201);
    const cov = (await get(`/routes/${routeId}/coverage?date=${today}`).expect(200)).body;
    expect(cov.visited).toBe(2);
    expect(cov.notVisited).toBe(1);
    const byId = Object.fromEntries(cov.rows.map((r: { customerId: string }) => [r.customerId, r]));
    expect(byId[customers[2]].outcome).toBe('SALE');
    expect(byId[customers[0]].outcome).toBe('SHOP_CLOSED');
    expect(byId[customers[1]].visited).toBe(false);
  });

  it('logging the same visit again corrects it instead of duplicating it', async () => {
    await post('/routes/visits', { customerId: customers[0], outcome: 'COLLECTION' }, repToken).expect(201);
    const visits = (await get(`/routes/visits?routeId=${routeId}&from=${today}&to=${today}`).expect(200)).body;
    const forCustomer = visits.filter((x: { customerId: string }) => x.customerId === customers[0]);
    expect(forCustomer).toHaveLength(1);
    expect(forCustomer[0].outcome).toBe('COLLECTION');
    expect(visits).toHaveLength(2);
  });

  it('refuses future dates, unknown customers and users without the permission', async () => {
    await post('/routes/visits', { customerId: customers[1], outcome: 'SALE', visitDate: iso(2) }, repToken).expect(400);
    await post('/routes/visits', { customerId: '00000000-0000-4000-8000-000000000000', outcome: 'SALE' }, repToken).expect(400);
    await post('/routes/visits', { customerId: customers[1], outcome: 'NOPE' }, repToken).expect(400);
    await post('/routes/visits', { customerId: customers[1], outcome: 'SALE' }, otherToken).expect(403);
  });

  it('a back-dated visit lands on its own day', async () => {
    const yesterday = iso(-1);
    await post('/routes/visits', { customerId: customers[1], outcome: 'NO_ORDER', visitDate: yesterday }, repToken).expect(201);
    expect((await get(`/routes/${routeId}/coverage?date=${yesterday}`).expect(200)).body.visited).toBe(1);
    expect((await get(`/routes/${routeId}/coverage?date=${today}`).expect(200)).body.visited).toBe(2);
  });
});
