import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApiErrorsHttpException } from './api-errors.exception';
import { ContractsService } from './contracts.service';

describe('ContractsService', () => {
  const contractsService = new ContractsService();

  it('validates a generate-content request payload', () => {
    const payload = contractsService.parseGenerateContentRequest({
      topic: '  RAG em producao  ',
      platform: 'linkedin',
      format: 'thread',
      pipeline_preset_id: 'c7d7f8a1-5e54-4fb3-9a9a-0c0a9fd0f7d1',
    });

    assert.equal(payload.topic, 'RAG em producao');
    assert.equal(payload.persona_id, null);
  });

  it('rejects blank topic and extra fields with structured validation errors', () => {
    assert.throws(
      () =>
        contractsService.parseGenerateContentRequest({
          topic: '   ',
          platform: 'linkedin',
          format: 'thread',
          pipeline_preset_id: 'c7d7f8a1-5e54-4fb3-9a9a-0c0a9fd0f7d1',
          extra: true,
        }),
      (error: unknown) => {
        assert.ok(error instanceof ApiErrorsHttpException);
        assert.equal(error.getStatus(), 400);
        const fields = error.payload.errors
          .map((item) => item.field)
          .filter((field): field is string => field !== null);
        assert.ok(fields.includes('extra'));
        assert.ok(fields.includes('topic'));
        assert.ok(
          error.payload.errors.every((item) => item.code === 'validation_error'),
        );
        return true;
      },
    );
  });

  it('rejects an invalid pipeline preset uuid with a structured validation error', () => {
    assert.throws(
      () =>
        contractsService.parseGenerateContentRequest({
          topic: 'RAG em producao',
          platform: 'linkedin',
          format: 'thread',
          pipeline_preset_id: 'not-a-uuid',
        }),
      (error: unknown) => {
        assert.ok(error instanceof ApiErrorsHttpException);
        assert.equal(error.getStatus(), 400);
        assert.deepEqual(error.payload.errors, [
          {
            code: 'validation_error',
            message: "Field must match format 'uuid'.",
            field: 'pipeline_preset_id',
            trace_id: null,
          },
        ]);
        return true;
      },
    );
  });
});
