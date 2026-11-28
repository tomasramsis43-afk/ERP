import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { AuthUser } from '../../common/decorators/auth.decorators';
import { loadEnv } from '../../config/env';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly env = loadEnv();

  /** Failed-login state is persisted so restarts and multiple instances share it. */
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly LOCKOUT_MS = 15 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  /** Loads the user with flattened roles and permissions; null if inactive/missing. */
  async loadAuthUser(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    if (!user || !user.isActive) return null;
    const roles = user.roles.map((ur) => ur.role.code);
    const permissions = [
      ...new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code))),
    ];
    return { id: user.id, email: user.email, roles, permissions, branchId: user.branchId ?? null };
  }

  async login(email: string, password: string, client: ClientInfo): Promise<TokenPair> {
    const key = email.toLowerCase();
    const state = await this.prisma.loginAttempt.findUnique({ where: { email: key } });
    const lockUntil = state?.lockedUntil ?? null;
    if (lockUntil && lockUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((lockUntil.getTime() - Date.now()) / 60_000);
      throw new UnauthorizedException(`Account locked. Try again in ${minutes} minute(s).`);
    }

    const user = await this.prisma.user.findUnique({ where: { email: key } });
    const ok = user?.isActive && (await bcrypt.compare(password, user.passwordHash));
    if (!user || !ok) {
      // An expired lockout starts a fresh counter; a live one cannot be reached here.
      const priorCount = lockUntil ? 0 : (state?.failedCount ?? 0);
      const failedCount = priorCount + 1;
      const nextLock = failedCount >= AuthService.MAX_ATTEMPTS ? new Date(Date.now() + AuthService.LOCKOUT_MS) : null;
      await this.prisma.loginAttempt.upsert({
        where: { email: key },
        update: { failedCount, lockedUntil: nextLock },
        create: { email: key, failedCount, lockedUntil: nextLock },
      });
      await this.audit.record({ action: 'LOGIN_FAILED', entity: 'User', newData: { email }, ...client });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Success: clear failed attempts.
    await this.prisma.loginAttempt.deleteMany({ where: { email: key } });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, ...client });
    return this.issueTokens(user.id, user.email, client);
  }

  /** Rotating refresh tokens: the presented token is revoked and a new pair is issued. */
  async refresh(refreshToken: string, client: ClientInfo): Promise<TokenPair> {
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');
    // Reuse of a revoked token indicates theft: revoke the entire token family for that user.
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Refresh token reuse detected; all sessions revoked');
    }
    if (stored.expiresAt < new Date()) throw new UnauthorizedException('Invalid refresh token');
    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid refresh token');

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    return this.issueTokens(user.id, user.email, client);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(userId: string, email: string, client: ClientInfo): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      { secret: this.env.jwtAccessSecret, expiresIn: this.env.jwtAccessTtl },
    );
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.env.jwtRefreshTtlDays * 86_400_000),
        userAgent: client.userAgent,
        ip: client.ip,
      },
    });
    return { accessToken, refreshToken, expiresIn: this.env.jwtAccessTtl };
  }
}
