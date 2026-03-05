import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { PipelinePresetsRepository } from './pipeline-presets/pipeline-presets.repository';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
  ],
  controllers: [HealthController],
  providers: [HealthService, PipelinePresetsRepository],
})
export class AppModule {}
