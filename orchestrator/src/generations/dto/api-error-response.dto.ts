export type ApiErrorCode =
  | 'authentication_failed'
  | 'validation_error'
  | 'pipeline_preset_not_found'
  | 'generation_not_found'
  | 'step_failed'
  | 'step_timeout'
  | 'repair_exhausted'
  | 'internal_error';

export type ApiErrorDto = {
  code: ApiErrorCode;
  message: string;
  field: string | null;
  trace_id: string | null;
};

export type ApiErrorResponseDto = {
  errors: ApiErrorDto[];
};

export function createApiError(
  code: ApiErrorCode,
  message: string,
  field: string | null = null,
  traceId: string | null = null,
): ApiErrorDto {
  return {
    code,
    message,
    field,
    trace_id: traceId,
  };
}

export function isApiErrorDto(value: unknown): value is ApiErrorDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    ('field' in value ? value.field === null || typeof value.field === 'string' : true) &&
    ('trace_id' in value
      ? value.trace_id === null || typeof value.trace_id === 'string'
      : true)
  );
}

export function isApiErrorResponseDto(
  value: unknown,
): value is ApiErrorResponseDto {
  if (!isRecord(value) || !Array.isArray(value.errors)) {
    return false;
  }

  return value.errors.every(isApiErrorDto);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
