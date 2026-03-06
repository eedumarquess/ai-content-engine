import type { ApiErrorDto } from './api-error-response.dto';

export const GENERATION_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
] as const;

export const GENERATION_STEP_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'dlq',
] as const;

export const PIPELINE_STEP_NAMES = ['content', 'review'] as const;

export type GenerationStatusDto = (typeof GENERATION_STATUSES)[number];
export type GenerationStepStatusDto = (typeof GENERATION_STEP_STATUSES)[number];
export type PipelineStepNameDto = (typeof PIPELINE_STEP_NAMES)[number];

export type GenerationDocumentV1Dto = {
  topic: string;
  strategy: {
    goal: string | null;
    angle: string | null;
    audience: string | null;
  };
  post: {
    hook: string;
    body: string;
    cta: string;
  };
  media: {
    image_prompt: string | null;
    carousel: string[];
    video_prompt: string | null;
  };
  metadata: {
    platform: string;
    format: string;
    pipeline: PipelineStepNameDto[];
    generation_id: string;
    schema_version: 'v1';
    persona_id: string | null;
    performance_context_used: boolean | null;
  };
};

export type GenerationStepSummaryDto = {
  name: PipelineStepNameDto;
  status: GenerationStepStatusDto;
  attempt_count: number;
};

export type GenerationExecutionMetadataDto = {
  pipeline_preset_id: string;
  schema_version: 'v1';
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  steps: GenerationStepSummaryDto[];
};

export type GetGenerationResponseDto = {
  generation_id: string;
  status: GenerationStatusDto;
  result: GenerationDocumentV1Dto | null;
  errors: ApiErrorDto[];
  metadata: GenerationExecutionMetadataDto;
};

export function isGenerationStatusDto(
  value: unknown,
): value is GenerationStatusDto {
  return (
    typeof value === 'string' &&
    (GENERATION_STATUSES as readonly string[]).includes(value)
  );
}

export function isGenerationStepStatusDto(
  value: unknown,
): value is GenerationStepStatusDto {
  return (
    typeof value === 'string' &&
    (GENERATION_STEP_STATUSES as readonly string[]).includes(value)
  );
}
