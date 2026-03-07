import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { ContractsModule } from './contracts/contracts.module';
import { DatabaseModule } from './database/database.module';
import { GenerationsModule } from './generations/generations.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { PipelineModule } from './pipeline/pipeline.module';
import { RabbitModule } from './rabbit/rabbit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    AuthModule,
    ContractsModule,
    DatabaseModule,
    RabbitModule,
    PipelineModule,
    GenerationsModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
