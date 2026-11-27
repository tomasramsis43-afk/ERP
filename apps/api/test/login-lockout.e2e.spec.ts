import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_ADMIN_EMAIL);
const d = enabled ? describe : describe.skip;
const uid = () => Math.random().toString(36).slice(2, 10);

d('persistent login lockout (end to end, requires seeded PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaClient;
  let adminToken: string;
  let email: string;
  const password = 'Test12345!';
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());
    prisma = new PrismaClient();
    adminToken = (
      await http
        .post('/auth/login')
        .send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD })
        .expect(200)
    ).body.accessToken;
    email = `lock-${uid()}@example.com`;
    await http
      .post('/users')
      .set(admin())
      .send({ email, fullName: 'Lockout Test', password, roleCodes: ['REPRESENTATIVE'] })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.loginAttempt.deleteMany({ where: { email } });
    await prisma.$disconnect();
    await app.close();
  });

  it('locks after five bad passwords and unlocks after the persisted window', async () => {
    for (let i = 0; i < 5; i++) {
      const bad = await http.post('/auth/login').send({ email, password: 'Wrong12345!' }).expect(401);
      expect(JSON.stringify(bad.body)).toMatch(/invalid credentials/i);
    }
    const stored = await prisma.loginAttempt.findUniqueOrThrow({ where: { email } });
    expect(stored.failedCount).toBe(5);
    expect(stored.lockedUntil).toBeTruthy();

    const locked = await http.post('/auth/login').send({ email, password }).expect(401);
    expect(JSON.stringify(locked.body)).toMatch(/account locked/i);

    // Simulate the lockout window elapsing; the counter is in the database, not memory.
    await prisma.loginAttempt.update({ where: { email }, data: { lockedUntil: new Date(Date.now() - 1000), failedCount: 0 } });
    await http.post('/auth/login').send({ email, password }).expect(200);
    expect(await prisma.loginAttempt.findUnique({ where: { email } })).toBeNull();
  });
});
