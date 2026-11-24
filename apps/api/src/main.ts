import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors({ origin: env.corsOrigins, credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('ERP API').setVersion('0.1.0').addBearerAuth().build(),
  );
  SwaggerModule.setup('api/docs', app, doc);

  await app.listen(env.port);
  new Logger('Bootstrap').log(`API listening on :${env.port}`);
}

void bootstrap();
