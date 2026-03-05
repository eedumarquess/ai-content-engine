import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  getLive(): { status: 'ok'; service: 'orchestrator' } {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  async getReady(): Promise<Record<string, unknown>> {
    const readiness = await this.healthService.getReadiness();

    if (readiness.status !== 'ok') {
      throw new ServiceUnavailableException(readiness);
    }

    return readiness;
  }
}

