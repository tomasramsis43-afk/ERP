export interface AppEnv {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessTtl: string;
  jwtRefreshTtlDays: number;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.startsWith('CHANGE_ME')) {
    throw new Error(`Environment variable ${name} must be set to a real value`);
  }
  return v;
}

export function loadEnv(): AppEnv {
  return {
    port: Number(process.env.API_PORT ?? 3001),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
    jwtAccessSecret: required('JWT_ACCESS_SECRET'),
    jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
    jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    jwtRefreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 7),
  };
}
