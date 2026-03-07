import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApiErrorsHttpException } from '../contracts/api-errors.exception';
import {
  buildPerformanceMemoryProjection,
  PerformanceEventsService,
} from './performance-events.service';

describe('PerformanceEventsService', () => {
  it('stores a normalized performance event and returns its ack', async () => {
    const repository = new FakePerformanceEventsRepository();
    const service = new PerformanceEventsService(
      {
        findGenerationForUser: async () => ({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        }),
      } as never,
      repository as never,
    );

    const ack = await service.createEvent(
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'local-admin@example.com',
      },
      {
        generation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        platform: ' linkedin ',
        post_id: ' post-123 ',
        metrics: {
          likes: 10,
          comments: 2,
          shares: 1,
          impressions: 400,
          engagement_rate: 0.0325,
        },
      },
    );

    assert.deepEqual(ack, {
      event_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      status: 'stored',
    });
    assert.deepEqual(repository.insertCalls, [
      {
        userId: '11111111-1111-4111-8111-111111111111',
        generationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        platform: 'linkedin',
        postId: 'post-123',
        metrics: {
          likes: 10,
          comments: 2,
          shares: 1,
          impressions: 400,
          engagement_rate: 0.0325,
        },
      },
    ]);
  });

  it('rejects invalid payloads with structured validation errors', async () => {
    const service = new PerformanceEventsService(
      {
        findGenerationForUser: async () => null,
      } as never,
      new FakePerformanceEventsRepository() as never,
    );

    assert.throws(
      () =>
        service.parseRequest({
          platform: 'linkedin',
          metrics: {
            likes: -1,
            comments: 2,
            shares: 1,
            impressions: 400,
            engagement_rate: 1.5,
          },
          extra: true,
        }),
      (error: unknown) => {
        assert.ok(error instanceof ApiErrorsHttpException);
        assert.equal(error.getStatus(), 400);
        const fields = error.payload.errors
          .map((item) => item.field)
          .filter((field): field is string => field !== null);
        assert.ok(fields.includes('extra'));
        assert.ok(fields.includes('metrics.likes'));
        assert.ok(fields.includes('metrics.engagement_rate'));
        assert.ok(
          error.payload.errors.every((item) => item.code === 'validation_error'),
        );
        return true;
      },
    );
  });

  it('rejects generation ids that do not belong to the current user', async () => {
    const service = new PerformanceEventsService(
      {
        findGenerationForUser: async () => null,
      } as never,
      new FakePerformanceEventsRepository() as never,
    );

    await assert.rejects(
      () =>
        service.createEvent(
          {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'local-admin@example.com',
          },
          {
            generation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            platform: 'linkedin',
            metrics: {
              likes: 10,
              comments: 2,
              shares: 1,
              impressions: 400,
              engagement_rate: 0.0325,
            },
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof ApiErrorsHttpException);
        assert.equal(error.getStatus(), 404);
        assert.deepEqual(error.payload.errors, [
          {
            code: 'generation_not_found',
            message: 'Generation was not found.',
            field: 'generation_id',
            trace_id: null,
          },
        ]);
        return true;
      },
    );
  });

  it('builds a future rag projection from the normalized payload', () => {
    const projection = buildPerformanceMemoryProjection({
      generation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      platform: 'linkedin',
      post_id: 'post-123',
      metrics: {
        likes: 10,
        comments: 2,
        shares: 1,
        impressions: 400,
        engagement_rate: 0.0325,
      },
    });

    assert.deepEqual(projection.tags, ['performance', 'linkedin']);
    assert.equal(projection.metadata.source, 'performance-events-api');
    assert.equal(
      projection.metadata.generation_id,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    assert.match(projection.content, /engagement_rate=0.0325/);
  });
});

class FakePerformanceEventsRepository {
  insertCalls: Array<{
    userId: string;
    generationId: string | null;
    platform: string;
    postId: string | null;
    metrics: {
      likes: number;
      comments: number;
      shares: number;
      impressions: number;
      engagement_rate: number;
    };
  }> = [];

  async insert(input: {
    userId: string;
    generationId: string | null;
    platform: string;
    postId: string | null;
    metrics: {
      likes: number;
      comments: number;
      shares: number;
      impressions: number;
      engagement_rate: number;
    };
  }): Promise<string> {
    this.insertCalls.push(input);
    return 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  }
}
