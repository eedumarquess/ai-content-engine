import { isApiErrorResponseDto, type ApiErrorResponseDto } from '../generations/dto/api-error-response.dto';

export type PipelineStepName = 'content' | 'review';

export type StepRpcRequest = {
  generation_id: string;
  user_id: string;
  step_name: PipelineStepName;
  input_json: {
    request: {
      topic: string;
      platform: string;
      format: string;
      persona_id: string | null;
    };
    generation: {
      generation_id: string;
      pipeline_preset_id: string;
      user_id: string;
      pipeline: PipelineStepName[];
      schema_version: 'v1';
    };
    document: Record<string, unknown> | null;
  };
  prompt_version: 'v1';
  config: {
    provider: 'ollama';
    model: string;
  };
};

export type WorkerReplyMetadata = {
  agent_name: string | null;
  provider: string | null;
  model: string | null;
  prompt_version: string | null;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  repair_attempts: number;
  trace_id: string | null;
};

export type StepRpcSuccessReply = {
  ok: true;
  output_json: Record<string, unknown>;
  reply_metadata: Record<string, unknown>;
};

export type StepRpcFailureReply = {
  ok: false;
  error_json: ApiErrorResponseDto;
  output_json: Record<string, unknown> | null;
  reply_metadata: Record<string, unknown>;
};

export type StepRpcReply = StepRpcSuccessReply | StepRpcFailureReply;

export type DlqMessage = {
  generation_id: string;
  user_id: string;
  pipeline_preset_id: string;
  step_name: PipelineStepName;
  queue: string;
  attempt_count: number;
  correlation_id: string;
  input_json: Record<string, unknown>;
  output_json: Record<string, unknown> | null;
  error_json: ApiErrorResponseDto;
  reply_metadata: Record<string, unknown>;
  failed_at: string;
};

export function isStepRpcReply(value: unknown): value is StepRpcReply {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    return false;
  }

  if (!isRecord(value.reply_metadata)) {
    return false;
  }

  if (value.ok) {
    return isRecord(value.output_json);
  }

  return (
    (value.output_json === null || isRecord(value.output_json)) &&
    isApiErrorResponseDto(value.error_json)
  );
}

export function normalizeWorkerReplyMetadata(
  value: Record<string, unknown>,
): WorkerReplyMetadata {
  return {
    agent_name: typeof value.agent_name === 'string' ? value.agent_name : null,
    provider: typeof value.provider === 'string' ? value.provider : null,
    model: typeof value.model === 'string' ? value.model : null,
    prompt_version:
      typeof value.prompt_version === 'string' ? value.prompt_version : null,
    tokens_in: toNonNegativeInteger(value.tokens_in),
    tokens_out: toNonNegativeInteger(value.tokens_out),
    latency_ms: toNonNegativeInteger(value.latency_ms),
    repair_attempts: toNonNegativeInteger(value.repair_attempts),
    trace_id: typeof value.trace_id === 'string' ? value.trace_id : null,
  };
}

function toNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
