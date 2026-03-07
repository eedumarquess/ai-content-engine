import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { BasicAuthGuard } from '../auth/basic-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { GetGenerationResponseDto } from './dto/get-generation-response.dto';
import { GenerationsQueryService } from './generations-query.service';

@Controller()
@UseGuards(BasicAuthGuard)
export class GenerationsController {
  constructor(
    private readonly generationsQueryService: GenerationsQueryService,
  ) {}

  @Get('generations/:id')
  getGeneration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<GetGenerationResponseDto> {
    return this.generationsQueryService.getGeneration(user, id);
  }
}
