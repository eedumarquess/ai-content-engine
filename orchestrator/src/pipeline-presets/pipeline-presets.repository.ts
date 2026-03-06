import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type {
  PipelinePresetDefinition,
  StoredPipelinePreset,
} from './pipeline-preset.types';
import { isPipelinePresetDefinition } from './pipeline-preset.types';

type PipelinePresetRow = {
  id: string;
  user_id: string | null;
  name: string;
  steps: unknown;
  is_active: boolean;
  created_at: Date;
};

@Injectable()
export class PipelinePresetsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findActivePresetForUser(
    presetId: string,
    userId: string,
  ): Promise<StoredPipelinePreset | null> {
    const result = await this.databaseService.query<PipelinePresetRow>(
      `
        SELECT id, user_id, name, steps, is_active, created_at
        FROM pipeline_presets
        WHERE id = $1
          AND is_active = TRUE
          AND (user_id IS NULL OR user_id = $2)
        LIMIT 1
      `,
      [presetId, userId],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    if (!isPipelinePresetDefinition(row.steps)) {
      throw new Error(`Pipeline preset ${presetId} has an invalid steps payload.`);
    }

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      steps: row.steps,
      isActive: row.is_active,
      createdAt: row.created_at,
    };
  }
}
