import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ConfigService } from '@nestjs/config';

import { ApiErrorsHttpException } from '../contracts/api-errors.exception';
import type { DatabaseService } from '../database/database.service';
import { hashPassword } from '../database/password';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('authenticates valid basic credentials against the users table', async () => {
    const passwordHash = await hashPassword('change-me');
    const databaseService = {
      query: async () => ({
        rows: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'local-admin@example.com',
            password_hash: passwordHash,
          },
        ],
      }),
    } as unknown as DatabaseService;
    const configService = {
      getOrThrow: () => 'AI Content Engine',
    } as unknown as ConfigService;
    const authService = new AuthService(databaseService, configService);

    const user = await authService.authenticateBasicHeader(
      `Basic ${Buffer.from('local-admin@example.com:change-me').toString('base64')}`,
    );

    assert.equal(user.email, 'local-admin@example.com');
    assert.equal(authService.getChallengeHeader(), 'Basic realm="AI Content Engine"');
  });

  it('returns a structured 401 for invalid credentials', async () => {
    const databaseService = {
      query: async () => ({ rows: [] }),
    } as unknown as DatabaseService;
    const configService = {
      getOrThrow: () => 'AI Content Engine',
    } as unknown as ConfigService;
    const authService = new AuthService(databaseService, configService);

    await assert.rejects(
      () => authService.authenticateBasicHeader('Basic invalid'),
      (error: unknown) => {
        assert.ok(error instanceof ApiErrorsHttpException);
        assert.equal(error.getStatus(), 401);
        assert.equal(error.payload.errors[0]?.code, 'authentication_failed');
        return true;
      },
    );
  });
});
