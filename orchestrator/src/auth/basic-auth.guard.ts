import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';

import { ApiErrorsHttpException } from '../contracts/api-errors.exception';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

type ResponseWithHeaders = {
  setHeader(name: string, value: string): void;
};

@Injectable()
export class BasicAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<ResponseWithHeaders>();

    try {
      request.user = await this.authService.authenticateBasicHeader(
        getAuthorizationHeader(request.headers),
      );
      return true;
    } catch (error) {
      if (
        error instanceof ApiErrorsHttpException &&
        error.getStatus() === 401
      ) {
        response.setHeader('WWW-Authenticate', this.authService.getChallengeHeader());
      }

      throw error;
    }
  }
}

function getAuthorizationHeader(
  headers: AuthenticatedRequest['headers'],
): string | undefined {
  const header = headers.authorization;

  return Array.isArray(header) ? header[0] : header;
}
