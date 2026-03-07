import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

import type { GenerateContentRequestDto } from './dto/generate-content-request.dto';
import { DatabaseService } from '../database/database.service';
import type { StoredPipelinePreset } from '../pipeline-presets/pipeline-preset.types';

export type GenerationStepStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'dlq';

export type GenerationRecord = {
  id: string;
  user_id: string;
  pipeline_preset_id: string | null;
  topic: string;
  platform: string;
  format: string;
  pipeline: unknown;
  schema_version: string;
  status: string;
  result_json: unknown;
  error_json: unknown;
  created_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  steps: GenerationStepRecord[];
};

export type GenerationStepRecord = {
  id: string;
  generation_id: string;
  step_name: string;
  status: string;
  attempt_count: number;
  input_json: unknown;
  output_json: unknown;
  error_json: unknown;
  reply_metadata: unknown;
  started_at: Date | string | null;
  finished_at: Date | string | null;
};

type GenerationRow = Omit<GenerationRecord, 'steps'>;
type GenerationStepRow = GenerationStepRecord;

type InsertedGenerationRow = {
  id: string;
};

type LockResultRow = {
  locked: boolean;
};

@Injectable()
export class GenerationsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createGeneration(input: {
    userId: string;
    request: GenerateContentRequestDto;
    preset: StoredPipelinePreset;
  }): Promise<string> {
    const client = await this.databaseService.connect();

    try {
      await client.query('BEGIN');

      const inserted = await client.query<InsertedGenerationRow>(
        `
          INSERT INTO generations (
            user_id,
            pipeline_preset_id,
            topic,
            platform,
            format,
            pipeline,
            schema_version,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'v1', 'queued')
          RETURNING id
        `,
        [
          input.userId,
          input.request.pipeline_preset_id,
          input.request.topic,
          input.request.platform,
          input.request.format,
          input.preset.steps,
        ],
      );
      const generationId = inserted.rows[0]?.id;

      if (!generationId) {
        throw new Error('Failed to create generation.');
      }

      for (const step of input.preset.steps.steps) {
        await client.query(
          `
            INSERT INTO generation_steps (
              generation_id,
              step_name,
              status,
              attempt_count,
              input_json,
              reply_metadata
            )
            VALUES ($1, $2, 'queued', 0, $3::jsonb, '{}'::jsonb)
            ON CONFLICT (generation_id, step_name) DO NOTHING
          `,
          [
            generationId,
            step.name,
            JSON.stringify({
              request: {
                topic: input.request.topic,
                platform: input.request.platform,
                format: input.request.format,
                persona_id: input.request.persona_id ?? null,
              },
              generation: {
                generation_id: generationId,
                pipeline_preset_id: input.request.pipeline_preset_id,
                user_id: input.userId,
                pipeline: input.preset.steps.steps.map((candidate) => candidate.name),
                schema_version: 'v1',
              },
              document: null,
            }),
          ],
        );
      }

      await client.query('COMMIT');
      return generationId;
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async findGenerationForUser(
    generationId: string,
    userId: string,
  ): Promise<GenerationRecord | null> {
    const generationResult = await this.databaseService.query<GenerationRow>(
      `
        SELECT
          id,
          user_id,
          pipeline_preset_id,
          topic,
          platform,
          format,
          pipeline,
          schema_version,
          status,
          result_json,
          error_json,
          created_at,
          started_at,
          completed_at
        FROM generations
        WHERE id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [generationId, userId],
    );
    const generation = generationResult.rows[0];

    if (!generation) {
      return null;
    }

    return {
      ...generation,
      steps: await this.findGenerationSteps(generationId),
    };
  }

  async findGenerationById(generationId: string): Promise<GenerationRecord | null> {
    const generationResult = await this.databaseService.query<GenerationRow>(
      `
        SELECT
          id,
          user_id,
          pipeline_preset_id,
          topic,
          platform,
          format,
          pipeline,
          schema_version,
          status,
          result_json,
          error_json,
          created_at,
          started_at,
          completed_at
        FROM generations
        WHERE id = $1
        LIMIT 1
      `,
      [generationId],
    );
    const generation = generationResult.rows[0];

    if (!generation) {
      return null;
    }

    return {
      ...generation,
      steps: await this.findGenerationSteps(generationId),
    };
  }

  async findPendingGenerationIds(): Promise<string[]> {
    const result = await this.databaseService.query<{ id: string }>(
      `
        SELECT id
        FROM generations
        WHERE status IN ('queued', 'running')
          AND completed_at IS NULL
        ORDER BY created_at ASC
      `,
    );

    return result.rows.map((row) => row.id);
  }

  connect(): Promise<PoolClient> {
    return this.databaseService.connect();
  }

  async tryAcquireGenerationLock(
    client: PoolClient,
    generationId: string,
  ): Promise<boolean> {
    const result = await client.query<LockResultRow>(
      `
        SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked
      `,
      [generationId],
    );

    return result.rows[0]?.locked ?? false;
  }

  async releaseGenerationLock(
    client: PoolClient,
    generationId: string,
  ): Promise<void> {
    await client.query(
      `
        SELECT pg_advisory_unlock(hashtextextended($1, 0))
      `,
      [generationId],
    );
  }

  async markGenerationRunning(
    client: PoolClient,
    generationId: string,
  ): Promise<void> {
    await client.query(
      `
        UPDATE generations
        SET status = 'running',
            started_at = COALESCE(started_at, now())
        WHERE id = $1
          AND status IN ('queued', 'running')
      `,
      [generationId],
    );
  }

  async markStepRunning(
    client: PoolClient,
    input: {
      generationId: string;
      stepName: string;
      attemptCount: number;
      inputJson: unknown;
    },
  ): Promise<void> {
    await client.query(
      `
        UPDATE generation_steps
        SET status = 'running',
            attempt_count = $3,
            input_json = $4::jsonb,
            output_json = NULL,
            error_json = NULL,
            reply_metadata = '{}'::jsonb,
            started_at = now(),
            finished_at = NULL
        WHERE generation_id = $1
          AND step_name = $2
      `,
      [
        input.generationId,
        input.stepName,
        input.attemptCount,
        JSON.stringify(input.inputJson),
      ],
    );
  }

  async markStepCompleted(
    client: PoolClient,
    input: {
      generationId: string;
      stepName: string;
      outputJson: unknown;
      replyMetadata: unknown;
    },
  ): Promise<void> {
    await client.query(
      `
        UPDATE generation_steps
        SET status = 'completed',
            output_json = $3::jsonb,
            error_json = NULL,
            reply_metadata = $4::jsonb,
            finished_at = now()
        WHERE generation_id = $1
          AND step_name = $2
      `,
      [
        input.generationId,
        input.stepName,
        JSON.stringify(input.outputJson),
        JSON.stringify(input.replyMetadata),
      ],
    );
  }

  async markStepFailed(
    client: PoolClient,
    input: {
      generationId: string;
      stepName: string;
      outputJson: unknown;
      errorJson: unknown;
      replyMetadata: unknown;
    },
  ): Promise<void> {
    await client.query(
      `
        UPDATE generation_steps
        SET status = 'failed',
            output_json = $3::jsonb,
            error_json = $4::jsonb,
            reply_metadata = $5::jsonb,
            finished_at = now()
        WHERE generation_id = $1
          AND step_name = $2
      `,
      [
        input.generationId,
        input.stepName,
        JSON.stringify(input.outputJson),
        JSON.stringify(input.errorJson),
        JSON.stringify(input.replyMetadata),
      ],
    );
  }

  async markStepDlq(
    client: PoolClient,
    input: {
      generationId: string;
      stepName: string;
      outputJson: unknown;
      errorJson: unknown;
      replyMetadata: unknown;
    },
  ): Promise<void> {
    await client.query(
      `
        UPDATE generation_steps
        SET status = 'dlq',
            output_json = $3::jsonb,
            error_json = $4::jsonb,
            reply_metadata = $5::jsonb,
            finished_at = now()
        WHERE generation_id = $1
          AND step_name = $2
      `,
      [
        input.generationId,
        input.stepName,
        JSON.stringify(input.outputJson),
        JSON.stringify(input.errorJson),
        JSON.stringify(input.replyMetadata),
      ],
    );
  }

  async completeGeneration(
    client: PoolClient,
    generationId: string,
    resultJson: unknown,
  ): Promise<void> {
    await client.query(
      `
        UPDATE generations
        SET status = 'completed',
            result_json = $2::jsonb,
            error_json = NULL,
            completed_at = now()
        WHERE id = $1
      `,
      [generationId, JSON.stringify(resultJson)],
    );
  }

  async failGeneration(
    client: PoolClient,
    generationId: string,
    errorJson: unknown,
  ): Promise<void> {
    await client.query(
      `
        UPDATE generations
        SET status = 'failed',
            result_json = NULL,
            error_json = $2::jsonb,
            completed_at = now()
        WHERE id = $1
      `,
      [generationId, JSON.stringify(errorJson)],
    );
  }

  private async findGenerationSteps(
    generationId: string,
  ): Promise<GenerationStepRow[]> {
    const stepResult = await this.databaseService.query<GenerationStepRow>(
      `
        SELECT
          id,
          generation_id,
          step_name,
          status,
          attempt_count,
          input_json,
          output_json,
          error_json,
          reply_metadata,
          started_at,
          finished_at
        FROM generation_steps
        WHERE generation_id = $1
        ORDER BY step_name ASC
      `,
      [generationId],
    );

    return stepResult.rows;
  }
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Ignore rollback failures so the original error is preserved.
  }
}
