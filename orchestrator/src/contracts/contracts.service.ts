import { Injectable } from '@nestjs/common';
import Ajv2020 from 'ajv/dist/2020';
import type { AnySchemaObject, ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ApiErrorsHttpException } from './api-errors.exception';
import {
  createApiError,
  type ApiErrorCode,
  type ApiErrorDto,
} from '../generations/dto/api-error-response.dto';
import type { GenerateContentAckDto } from '../generations/dto/generate-content-ack.dto';
import type { GenerateContentRequestDto } from '../generations/dto/generate-content-request.dto';
import type {
  GenerationDocumentV1Dto,
  GetGenerationResponseDto,
} from '../generations/dto/get-generation-response.dto';

const GENERATED_SCHEMAS_DIR = join(process.cwd(), 'src', 'contracts', 'generated');

@Injectable()
export class ContractsService {
  private readonly ajv: Ajv2020;
  private readonly generateContentRequestValidator: ValidateFunction<GenerateContentRequestDto>;
  private readonly generateContentAckValidator: ValidateFunction<GenerateContentAckDto>;
  private readonly generationDocumentValidator: ValidateFunction<GenerationDocumentV1Dto>;
  private readonly generationStatusResponseValidator: ValidateFunction<GetGenerationResponseDto>;
  private readonly uuidValidator: ValidateFunction<string>;

  constructor() {
    this.ajv = new Ajv2020({
      allErrors: true,
      strict: false,
    });
    addFormats(this.ajv);

    this.generateContentRequestValidator = this.compileSchema<GenerateContentRequestDto>(
      'generate-content.request.v1.schema.json',
    );
    this.generateContentAckValidator = this.compileSchema<GenerateContentAckDto>(
      'generate-content.ack.v1.schema.json',
    );
    this.generationDocumentValidator =
      this.compileSchema<GenerationDocumentV1Dto>(
        'generation-document.v1.schema.json',
      );
    this.generationStatusResponseValidator =
      this.compileSchema<GetGenerationResponseDto>(
        'generation-status.response.v1.schema.json',
      );
    this.uuidValidator = this.ajv.compile<string>({
      type: 'string',
      format: 'uuid',
    });
  }

  parseGenerateContentRequest(input: unknown): GenerateContentRequestDto {
    const normalized = this.normalizeGenerateContentRequest(input);

    return this.assertWithValidator(
      this.generateContentRequestValidator,
      normalized,
      400,
      'validation_error',
    );
  }

  ensureGenerateContentAck(input: unknown): GenerateContentAckDto {
    return this.assertWithValidator(
      this.generateContentAckValidator,
      input,
      500,
      'internal_error',
    );
  }

  ensureGenerationDocument(input: unknown): GenerationDocumentV1Dto {
    return this.assertWithValidator(
      this.generationDocumentValidator,
      input,
      500,
      'internal_error',
    );
  }

  ensureGetGenerationResponse(input: unknown): GetGenerationResponseDto {
    return this.assertWithValidator(
      this.generationStatusResponseValidator,
      input,
      500,
      'internal_error',
    );
  }

  assertUuid(value: unknown, field: string): string {
    const normalized = typeof value === 'string' ? value.trim() : value;

    if (this.uuidValidator(normalized)) {
      return normalized;
    }

    throw new ApiErrorsHttpException(400, [
      createApiError(
        'validation_error',
        `Field must match format 'uuid'.`,
        field,
      ),
    ]);
  }

  private normalizeGenerateContentRequest(input: unknown): unknown {
    if (!isRecord(input)) {
      return input;
    }

    const normalized: Record<string, unknown> = { ...input };

    for (const field of [
      'topic',
      'platform',
      'format',
      'pipeline_preset_id',
      'persona_id',
    ] as const) {
      if (typeof normalized[field] === 'string') {
        normalized[field] = normalized[field].trim();
      }
    }

    if (!('persona_id' in normalized)) {
      normalized.persona_id = null;
    }

    return normalized;
  }

  private compileSchema<T>(filename: string): ValidateFunction<T> {
    const schema = this.loadSchema(filename);
    return this.ajv.compile<T>(schema);
  }

  private loadSchema(filename: string): AnySchemaObject {
    return JSON.parse(
      readFileSync(join(GENERATED_SCHEMAS_DIR, filename), 'utf-8'),
    ) as AnySchemaObject;
  }

  private assertWithValidator<T>(
    validator: ValidateFunction<T>,
    input: unknown,
    statusCode: number,
    code: ApiErrorCode,
  ): T {
    if (validator(input)) {
      return input as T;
    }

    throw new ApiErrorsHttpException(
      statusCode,
      this.toApiErrors(validator.errors, code),
    );
  }

  private toApiErrors(
    errors: ErrorObject[] | null | undefined,
    code: ApiErrorCode,
  ): ApiErrorDto[] {
    if (!errors || errors.length === 0) {
      return [createApiError(code, 'Contract validation failed.')];
    }

    return errors.map((error) => {
      const field = this.toFieldPath(error);
      const message =
        error.keyword === 'additionalProperties'
          ? 'Field is not allowed.'
          : error.keyword === 'required'
            ? 'Field is required.'
            : error.keyword === 'format'
              ? `Field must match format '${String((error.params as { format?: string }).format ?? 'unknown')}'.`
            : error.message ?? 'Contract validation failed.';

      return createApiError(code, message, field);
    });
  }

  private toFieldPath(error: ErrorObject): string | null {
    if (error.keyword === 'required') {
      const base = jsonPointerToDotPath(error.instancePath);
      const requiredProperty = String(
        (error.params as { requiredProperty: string }).requiredProperty,
      );

      return base ? `${base}.${requiredProperty}` : requiredProperty;
    }

    if (error.keyword === 'additionalProperties') {
      const base = jsonPointerToDotPath(error.instancePath);
      const additionalProperty = String(
        (error.params as { additionalProperty: string }).additionalProperty,
      );

      return base ? `${base}.${additionalProperty}` : additionalProperty;
    }

    return jsonPointerToDotPath(error.instancePath);
  }
}

function jsonPointerToDotPath(pointer: string): string | null {
  if (!pointer) {
    return null;
  }

  const parts = pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));

  let path = '';

  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      path = `${path}[${part}]`;
      continue;
    }

    path = path ? `${path}.${part}` : part;
  }

  return path || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
