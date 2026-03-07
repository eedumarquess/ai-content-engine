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
import type { GenerateContentAckDto } from './dto/generate-content-ack.dto';
import { GenerateService } from './generate.service';

@Controller()
@UseGuards(BasicAuthGuard)
export class GenerateController {
  constructor(private readonly generateService: GenerateService) {}

  @Post('generate-content')
  @HttpCode(HttpStatus.ACCEPTED)
  generateContent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<GenerateContentAckDto> {
    return this.generateService.createGeneration(user, body);
  }
}
