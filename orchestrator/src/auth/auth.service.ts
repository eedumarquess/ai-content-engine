import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiErrorsHttpException } from '../contracts/api-errors.exception';
import { DatabaseService } from '../database/database.service';
import { verifyPassword } from '../database/password';
import { createApiError } from '../generations/dto/api-error-response.dto';
import type { AuthenticatedUser } from './auth.types';

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
};

type BasicCredentials = {
  username: string;
  password: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  getChallengeHeader(): string {
    const realm = this.configService.getOrThrow<string>('AUTH_REALM');
    return `Basic realm="${realm}"`;
  }

  async authenticateBasicHeader(
    authorizationHeader: string | undefined,
  ): Promise<AuthenticatedUser> {
    const credentials = parseBasicCredentials(authorizationHeader);

    if (!credentials) {
      throw this.createAuthenticationError();
    }

    const normalizedEmail = credentials.username.trim().toLowerCase();

    if (!normalizedEmail || credentials.password.length === 0) {
      throw this.createAuthenticationError();
    }

    const result = await this.databaseService.query<UserRow>(
      `
        SELECT id, email, password_hash
        FROM users
        WHERE lower(email) = $1
        LIMIT 1
      `,
      [normalizedEmail],
    );
    const user = result.rows[0];

    if (!user) {
      throw this.createAuthenticationError();
    }

    const passwordMatches = await verifyPassword(
      credentials.password,
      user.password_hash,
    );

    if (!passwordMatches) {
      throw this.createAuthenticationError();
    }

    return {
      id: user.id,
      email: user.email,
    };
  }

  private createAuthenticationError(): ApiErrorsHttpException {
    return new ApiErrorsHttpException(401, [
      createApiError(
        'authentication_failed',
        'Invalid basic authentication credentials.',
      ),
    ]);
  }
}

function parseBasicCredentials(
  authorizationHeader: string | undefined,
): BasicCredentials | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, encodedCredentials] = authorizationHeader.split(' ', 2);

  if (!scheme || scheme.toLowerCase() !== 'basic' || !encodedCredentials) {
    return null;
  }

  try {
    const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString(
      'utf-8',
    );
    const separatorIndex = decodedCredentials.indexOf(':');

    if (separatorIndex < 0) {
      return null;
    }

    return {
      username: decodedCredentials.slice(0, separatorIndex),
      password: decodedCredentials.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}
