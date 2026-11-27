import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Render (and most hosts) put a load balancer in front: trust one hop so req.ip is the caller,
  // not the balancer (rate limiting and the audit log both use it).
  app.set('trust proxy', 1);

  app.use(helmet());
  app.enableCors({ origin: env.corsOrigins, credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger is useful in development; disable it in production to avoid exposing the API surface.
  if (env.nodeEnv !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('ERP API').setVersion('0.1.0').addBearerAuth().build(),
    );
    SwaggerModule.setup('api/docs', app, doc);
  }

  await app.listen(env.port);
  new Logger('Bootstrap').log(`API listening on :${env.port}`);
}

void bootstrap();
