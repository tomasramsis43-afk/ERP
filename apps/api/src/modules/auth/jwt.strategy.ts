import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../common/decorators/auth.decorators';
import { loadEnv } from '../../config/env';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly auth: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: loadEnv().jwtAccessSecret,
    });
  }

  /** Permissions are re-read on every request so role changes apply immediately. */
  async validate(payload: { sub: string }): Promise<AuthUser> {
    const user = await this.auth.loadAuthUser(payload.sub);
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
