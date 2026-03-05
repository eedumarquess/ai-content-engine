import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/env.validation';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}

