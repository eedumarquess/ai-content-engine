import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { BasicAuthGuard } from '../auth/basic-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PerformanceEventAckDto } from './dto/performance-event-ack.dto';
import { PerformanceEventsService } from './performance-events.service';

@Controller()
@UseGuards(BasicAuthGuard)
export class PerformanceEventsController {
  constructor(
    private readonly performanceEventsService: PerformanceEventsService,
  ) {}

  @Post('performance-events')
  @HttpCode(HttpStatus.CREATED)
  createEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<PerformanceEventAckDto> {
    return this.performanceEventsService.createEvent(user, body);
  }
}
