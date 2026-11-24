import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService, hashToken } from './auth.service';

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

function build(user: Record<string, unknown> | null, storedToken?: Record<string, unknown>) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue({}),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(storedToken ?? null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new AuthService(prisma as never, new JwtService({}), audit as never);
  return { service, prisma, audit };
}

describe('AuthService', () => {
  it('rejects wrong password and audits the failure', async () => {
    const hash = await bcrypt.hash('correct-password', 4);
    const { service, audit } = build({ id: 'u1', email: 'a@b.c', passwordHash: hash, isActive: true });
    await expect(service.login('a@b.c', 'wrong-password', {})).rejects.toThrow(UnauthorizedException);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN_FAILED' }));
  });

  it('rejects inactive users', async () => {
    const hash = await bcrypt.hash('correct-password', 4);
    const { service } = build({ id: 'u1', email: 'a@b.c', passwordHash: hash, isActive: false });
    await expect(service.login('a@b.c', 'correct-password', {})).rejects.toThrow(UnauthorizedException);
  });

  it('issues tokens and stores only the refresh token hash', async () => {
    const hash = await bcrypt.hash('correct-password', 4);
    const { service, prisma } = build({ id: 'u1', email: 'a@b.c', passwordHash: hash, isActive: true });
    const tokens = await service.login('a@b.c', 'correct-password', {});
    const stored = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(stored.tokenHash).toBe(hashToken(tokens.refreshToken));
    expect(stored.tokenHash).not.toBe(tokens.refreshToken);
  });

  it('rejects a revoked refresh token', async () => {
    const { service } = build(null, { id: 't', userId: 'u1', revokedAt: new Date(), expiresAt: new Date(Date.now() + 1e6) });
    await expect(service.refresh('x'.repeat(30), {})).rejects.toThrow(UnauthorizedException);
  });
});
