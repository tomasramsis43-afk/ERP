import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const uid = () => Math.random().toString(36).slice(2, 10);

d('security (requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());
    admin = (await http.post('/auth/login').send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD }).expect(200)).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('every business endpoint refuses anonymous callers', async () => {
    for (const path of ['/customers', '/products', '/sales/invoices', '/reports/dashboard', '/hr/employees', '/representatives', '/accounting/reports/trial-balance', '/sync/pull']) {
      await http.get(path).expect(401);
    }
  });

  it('rejects malformed, tampered and wrongly signed tokens', async () => {
    await http.get('/customers').set(bearer('garbage')).expect(401);
    const [h, p, s] = admin.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), roles: ['SYSTEM_ADMIN'], sub: 'someone-else' })).toString('base64url');
    await http.get('/customers').set(bearer(`${h}.${forgedPayload}.${s}`)).expect(401);
    await http.get('/customers').set(bearer(`${h}.${p}.`)).expect(401);
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${p}.`;
    await http.get('/customers').set(bearer(none)).expect(401);
  });

  it('refresh tokens rotate: the old one stops working, and logout revokes the session', async () => {
    const email = `sec-${uid()}@test.local`;
    await http.post('/users').set(bearer(admin)).send({ email, fullName: 'Sec', password: 'long-password-123', roleCodes: ['REPRESENTATIVE'] }).expect(201);
    const first = (await http.post('/auth/login').send({ email, password: 'long-password-123' }).expect(200)).body;
    const second = (await http.post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200)).body;
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await http.post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401); // replay of a used token
    await http.post('/auth/logout').send({ refreshToken: second.refreshToken }).expect(204);
    await http.post('/auth/refresh').send({ refreshToken: second.refreshToken }).expect(401);
  });

  it('never returns password hashes or token hashes', async () => {
    const users = await http.get('/users').set(bearer(admin)).expect(200);
    const text = JSON.stringify(users.body);
    expect(text).not.toMatch(/passwordHash|\$2[aby]\$/);
    expect(text).not.toMatch(/tokenHash/);
  });

  it('refuses unknown fields (mass assignment) and invalid input', async () => {
    await http.post('/customers').set(bearer(admin)).send({ code: `C-${uid()}`, nameAr: 'x', isActive: false, id: 'forced-id', createdAt: '2000-01-01' }).expect(400);
    await http.post('/customers').set(bearer(admin)).send({ code: '', nameAr: '' }).expect(400);
    await http.get('/customers/not-a-uuid').set(bearer(admin)).expect(400);
  });

  it('treats search text as data: injection strings return normally and break nothing', async () => {
    for (const q of ["' OR 1=1 --", "'; DROP TABLE \"Customer\"; --", '%', '\\', '<script>alert(1)</script>']) {
      await http.get('/customers').query({ q }).set(bearer(admin)).expect(200);
    }
    await http.get('/customers').set(bearer(admin)).expect(200); // the table is still there
  });

  it('error responses do not leak stack traces or SQL', async () => {
    const r = await http.get('/customers/00000000-0000-0000-0000-000000000000').set(bearer(admin));
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toMatch(/at .*\.ts|node_modules|prisma|SELECT /i);
  });

  it('permissions are enforced per role, not per login', async () => {
    const email = `ro-${uid()}@test.local`;
    await http.post('/users').set(bearer(admin)).send({ email, fullName: 'Rep', password: 'long-password-123', roleCodes: ['REPRESENTATIVE'] }).expect(201);
    const t = (await http.post('/auth/login').send({ email, password: 'long-password-123' }).expect(200)).body.accessToken;
    await http.post('/users').set(bearer(t)).send({ email: `x-${uid()}@test.local`, fullName: 'X', password: 'long-password-123', roleCodes: ['SYSTEM_ADMIN'] }).expect(403);
    await http.get('/hr/employees').set(bearer(t)).expect(403);
    await http.get('/accounting/reports/trial-balance').set(bearer(t)).expect(403);
  });

  // Last on purpose: it exhausts this app instance's login throttle.
  it('brute-force login attempts are throttled and never reveal whether the email exists', async () => {
    const unknown = await http.post('/auth/login').send({ email: `nobody-${uid()}@test.local`, password: 'whatever-123' });
    const wrong = await http.post('/auth/login').send({ email: process.env.SEED_ADMIN_EMAIL, password: 'wrong-password-123' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.message).toBe(wrong.body.message);
    const codes: number[] = [];
    for (let i = 0; i < 14; i++) codes.push((await http.post('/auth/login').send({ email: process.env.SEED_ADMIN_EMAIL, password: `wrong-${i}-password` })).status);
    expect(codes).toContain(429);
  });
});
