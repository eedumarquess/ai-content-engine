import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { AuthService } from './auth.service';
import { BasicAuthGuard } from './basic-auth.guard';

@Module({
  imports: [DatabaseModule],
  providers: [AuthService, BasicAuthGuard],
  exports: [AuthService, BasicAuthGuard],
})
export class AuthModule {}
