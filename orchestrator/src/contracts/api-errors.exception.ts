import { HttpException } from '@nestjs/common';

import type {
  ApiErrorDto,
  ApiErrorResponseDto,
} from '../generations/dto/api-error-response.dto';

export class ApiErrorsHttpException extends HttpException {
  readonly payload: ApiErrorResponseDto;

  constructor(statusCode: number, errors: ApiErrorDto[]) {
    const payload = { errors } satisfies ApiErrorResponseDto;
    super(payload, statusCode);
    this.payload = payload;
  }
}
