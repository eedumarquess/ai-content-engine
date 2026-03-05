import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('ORCHESTRATOR_PORT');

  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to bootstrap orchestrator.', error);
  process.exit(1);
});

