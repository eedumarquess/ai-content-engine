import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { GenerationsDataModule } from '../generations/generations-data.module';
import { PerformanceEventsController } from './performance-events.controller';
import { PerformanceEventsRepository } from './performance-events.repository';
import { PerformanceEventsService } from './performance-events.service';

@Module({
  imports: [AuthModule, DatabaseModule, GenerationsDataModule],
  controllers: [PerformanceEventsController],
  providers: [PerformanceEventsRepository, PerformanceEventsService],
})
export class PerformanceEventsModule {}
