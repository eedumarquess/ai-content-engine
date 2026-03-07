import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type { PerformanceEventMetricsDto } from './dto/performance-event-request.dto';

type InsertedPerformanceEventRow = {
  id: string;
};

@Injectable()
export class PerformanceEventsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async insert(input: {
    userId: string;
    generationId: string | null;
    platform: string;
    postId: string | null;
    metrics: PerformanceEventMetricsDto;
  }): Promise<string> {
    const result = await this.databaseService.query<InsertedPerformanceEventRow>(
      `
        INSERT INTO performance_events (
          user_id,
          generation_id,
          platform,
          post_id,
          metrics
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
        RETURNING id
      `,
      [
        input.userId,
        input.generationId,
        input.platform,
        input.postId,
        JSON.stringify(input.metrics),
      ],
    );

    const eventId = result.rows[0]?.id;

    if (!eventId) {
      throw new Error('Failed to insert performance event.');
    }

    return eventId;
  }
}
