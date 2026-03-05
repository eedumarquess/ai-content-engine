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
