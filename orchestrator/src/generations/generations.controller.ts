import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { BasicAuthGuard } from '../auth/basic-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { GenerateContentAckDto } from './dto/generate-content-ack.dto';
import type { GetGenerationResponseDto } from './dto/get-generation-response.dto';
import { GenerationsService } from './generations.service';

@Controller()
@UseGuards(BasicAuthGuard)
export class GenerationsController {
  constructor(private readonly generationsService: GenerationsService) {}

  @Post('generate-content')
  @HttpCode(HttpStatus.ACCEPTED)
  generateContent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<GenerateContentAckDto> {
    return this.generationsService.createGeneration(user, body);
  }

  @Get('generations/:id')
  getGeneration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<GetGenerationResponseDto> {
    return this.generationsService.getGeneration(user, id);
  }
}
