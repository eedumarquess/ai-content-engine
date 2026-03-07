import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { AuthenticatedUser } from '../auth/auth.types';
import { ApiErrorsHttpException } from '../contracts/api-errors.exception';
import { createApiError } from '../generations/dto/api-error-response.dto';
import { GenerationsRepository } from '../generations/generations.repository';
import type { PerformanceEventAckDto } from './dto/performance-event-ack.dto';
import type {
  PerformanceEventMetricsDto,
  PerformanceEventRequestDto,
} from './dto/performance-event-request.dto';
import { PerformanceEventsRepository } from './performance-events.repository';

const performanceEventSchema = z
  .object({
    generation_id: z.string().uuid().nullable().optional(),
    platform: z.string().trim().min(1),
    post_id: z.string().trim().min(1).nullable().optional(),
    metrics: z
      .object({
        likes: z.number().int().nonnegative(),
        comments: z.number().int().nonnegative(),
        shares: z.number().int().nonnegative(),
        impressions: z.number().int().nonnegative(),
        engagement_rate: z.number().min(0).max(1),
      })
      .strict(),
  })
  .strict()
  .transform((value) => ({
    generation_id: value.generation_id ?? null,
    platform: value.platform,
    post_id: value.post_id ?? null,
    metrics: value.metrics,
  }));

export type PerformanceMemoryProjection = {
  platform: string;
  tags: string[];
  content: string;
  metadata: {
    source: 'performance-events-api';
    generation_id: string | null;
    post_id: string | null;
    metrics: PerformanceEventMetricsDto;
  };
};

@Injectable()
export class PerformanceEventsService {
  constructor(
    private readonly generationsRepository: GenerationsRepository,
    private readonly performanceEventsRepository: PerformanceEventsRepository,
  ) {}

  async createEvent(
    user: AuthenticatedUser,
    payload: unknown,
  ): Promise<PerformanceEventAckDto> {
    const request = this.parseRequest(payload);

    if (request.generation_id !== null) {
      const generation = await this.generationsRepository.findGenerationForUser(
        request.generation_id,
        user.id,
      );

      if (!generation) {
        throw new ApiErrorsHttpException(404, [
          createApiError(
            'generation_not_found',
            'Generation was not found.',
            'generation_id',
          ),
        ]);
      }
    }

    const eventId = await this.performanceEventsRepository.insert({
      userId: user.id,
      generationId: request.generation_id,
      platform: request.platform,
      postId: request.post_id,
      metrics: request.metrics,
    });

    return {
      event_id: eventId,
      status: 'stored',
    };
  }

  parseRequest(payload: unknown): PerformanceEventRequestDto {
    const result = performanceEventSchema.safeParse(payload);

    if (result.success) {
      return result.data;
    }

    throw new ApiErrorsHttpException(
      400,
      result.error.issues.map((issue) =>
        createApiError(
          'validation_error',
          mapIssueMessage(issue),
          getIssueField(issue),
        ),
      ),
    );
  }
}

export function buildPerformanceMemoryProjection(
  request: PerformanceEventRequestDto,
): PerformanceMemoryProjection {
  const metrics = request.metrics;

  return {
    platform: request.platform,
    tags: ['performance', request.platform],
    content: [
      `Performance event on ${request.platform}.`,
      `likes=${metrics.likes}.`,
      `comments=${metrics.comments}.`,
      `shares=${metrics.shares}.`,
      `impressions=${metrics.impressions}.`,
      `engagement_rate=${metrics.engagement_rate}.`,
    ].join(' '),
    metadata: {
      source: 'performance-events-api',
      generation_id: request.generation_id,
      post_id: request.post_id,
      metrics,
    },
  };
}

function formatIssuePath(path: (string | number)[]): string | null {
  if (path.length === 0) {
    return null;
  }

  return path
    .map((segment) =>
      typeof segment === 'number' ? `[${segment}]` : String(segment),
    )
    .reduce((accumulator, segment) => {
      if (segment.startsWith('[')) {
        return `${accumulator}${segment}`;
      }

      return accumulator ? `${accumulator}.${segment}` : segment;
    }, '');
}

function mapIssueMessage(issue: z.ZodIssue): string {
  if (issue.code === 'invalid_type' && issue.received === 'undefined') {
    return 'Field is required.';
  }

  if (issue.code === 'unrecognized_keys') {
    return 'Field is not allowed.';
  }

  if (issue.code === 'invalid_string' && issue.validation === 'uuid') {
    return "Field must match format 'uuid'.";
  }

  if (issue.code === 'too_small') {
    return 'Field must be greater than or equal to the minimum allowed value.';
  }

  if (issue.code === 'too_big') {
    return 'Field must be less than or equal to the maximum allowed value.';
  }

  return issue.message || 'Contract validation failed.';
}

function getIssueField(issue: z.ZodIssue): string | null {
  if (issue.code === 'unrecognized_keys' && issue.keys.length > 0) {
    return issue.keys[0] ?? null;
  }

  return formatIssuePath(issue.path);
}
