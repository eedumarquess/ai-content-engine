export type PipelineStepName = 'content' | 'review';

export type PipelinePresetStepDefinition = {
  name: PipelineStepName;
  agent: string;
  queue: string;
  timeout_ms: number;
  max_retries: number;
};

export type PipelinePresetDefinition = {
  version: string;
  steps: PipelinePresetStepDefinition[];
};

export type StoredPipelinePreset = {
  id: string;
  userId: string | null;
  name: string;
  steps: PipelinePresetDefinition;
  isActive: boolean;
  createdAt: Date;
};

export function isPipelinePresetDefinition(
  value: unknown,
): value is PipelinePresetDefinition {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.version !== 'string' || !Array.isArray(value.steps)) {
    return false;
  }

  return value.steps.every(isPipelinePresetStepDefinition);
}

export function isPipelinePresetStepDefinition(
  value: unknown,
): value is PipelinePresetStepDefinition {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === 'string' &&
    typeof value.agent === 'string' &&
    typeof value.queue === 'string' &&
    typeof value.timeout_ms === 'number' &&
    Number.isInteger(value.timeout_ms) &&
    value.timeout_ms > 0 &&
    typeof value.max_retries === 'number' &&
    Number.isInteger(value.max_retries) &&
    value.max_retries >= 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
