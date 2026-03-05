import { createHash } from 'crypto';

import type { Pool, PoolClient } from 'pg';

import { createDatabasePool } from './client';
import {
  DATABASE_BOOTSTRAP_LOCK_KEY,
  DATABASE_BOOTSTRAP_LOCK_NAMESPACE,
  SCHEMA_MIGRATIONS_TABLE,
} from './constants';
import { databaseMigrations } from './migrations';

type RunMigrationsOptions = {
  connectionString: string;
  embeddingDim: number;
};

type AppliedMigration = {
  filename: string;
  checksum: string;
};

export async function runMigrations(
  options: RunMigrationsOptions,
): Promise<void> {
  const pool = createDatabasePool(options.connectionString);

  try {
    await runMigrationsWithPool(pool, options.embeddingDim);
  } finally {
    await pool.end();
  }
}

export async function runMigrationsWithPool(
  pool: Pool,
  embeddingDim: number,
): Promise<void> {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await assertRequiredExtensions(client);
    await client.query(
      'SELECT pg_advisory_lock($1, $2)',
      [DATABASE_BOOTSTRAP_LOCK_NAMESPACE, DATABASE_BOOTSTRAP_LOCK_KEY],
    );
    lockAcquired = true;

    await ensureSchemaMigrationsTable(client);
    const appliedMigrations = await loadAppliedMigrations(client);

    for (const migration of [...databaseMigrations].sort((left, right) =>
      left.filename.localeCompare(right.filename),
    )) {
      const sql = migration.renderSql(embeddingDim);
      const checksum = createChecksum(sql);
      const applied = appliedMigrations.get(migration.filename);

      if (applied) {
        if (applied !== checksum) {
          throw new Error(
            `Migration ${migration.filename} checksum mismatch. Expected ${applied}, received ${checksum}.`,
          );
        }

        continue;
      }

      await applyMigration(client, migration.filename, sql, checksum);
    }
  } finally {
    if (lockAcquired) {
      await client.query(
        'SELECT pg_advisory_unlock($1, $2)',
        [DATABASE_BOOTSTRAP_LOCK_NAMESPACE, DATABASE_BOOTSTRAP_LOCK_KEY],
      );
    }

    client.release();
  }
}

async function assertRequiredExtensions(client: PoolClient): Promise<void> {
  const requiredExtensions = ['vector', 'pgcrypto'];
  const result = await client.query<{ extname: string }>(
    `
      SELECT extname
      FROM pg_extension
      WHERE extname = ANY($1::text[])
    `,
    [requiredExtensions],
  );

  const availableExtensions = new Set(result.rows.map((row) => row.extname));
  const missingExtensions = requiredExtensions.filter(
    (extension) => !availableExtensions.has(extension),
  );

  if (missingExtensions.length > 0) {
    throw new Error(
      `Missing required Postgres extensions: ${missingExtensions.join(', ')}.`,
    );
  }
}

async function ensureSchemaMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function loadAppliedMigrations(
  client: PoolClient,
): Promise<Map<string, string>> {
  const result = await client.query<AppliedMigration>(
    `
      SELECT filename, checksum
      FROM ${SCHEMA_MIGRATIONS_TABLE}
    `,
  );

  return new Map(
    result.rows.map((row) => [row.filename, row.checksum] as const),
  );
}

async function applyMigration(
  client: PoolClient,
  filename: string,
  sql: string,
  checksum: string,
): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(sql);
    await client.query(
      `
        INSERT INTO ${SCHEMA_MIGRATIONS_TABLE} (filename, checksum)
        VALUES ($1, $2)
      `,
      [filename, checksum],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function createChecksum(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
