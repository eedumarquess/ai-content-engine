import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { ContractsModule } from './contracts/contracts.module';
import { DatabaseModule } from './database/database.module';
import { GenerationsModule } from './generations/generations.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    AuthModule,
    ContractsModule,
    DatabaseModule,
    GenerationsModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
