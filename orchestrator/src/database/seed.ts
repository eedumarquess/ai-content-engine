import type { Pool, PoolClient } from 'pg';

import { createDatabasePool } from './client';
import { CONTENT_REVIEW_V1_PRESET_ID } from './constants';
import { embedTextWithOllama } from './ollama';
import { hashPassword, verifyPassword } from './password';
import {
  buildContentReviewPresetDefinition,
  getSeedPreset,
  getSeedRagDocuments,
} from './seed-data';

type RunSeedOptions = {
  connectionString: string;
  ollamaBaseUrl: string;
  ollamaEmbedModel: string;
  embeddingDim: number;
  adminEmail: string;
  adminPassword: string;
  contentQueue: string;
  reviewQueue: string;
};

type ExistingUserRow = {
  id: string;
  email: string;
  password_hash: string;
};

export async function runSeed(options: RunSeedOptions): Promise<void> {
  const pool = createDatabasePool(options.connectionString);

  try {
    await runSeedWithPool(pool, options);
  } finally {
    await pool.end();
  }
}

export async function runSeedWithPool(
  pool: Pool,
  options: RunSeedOptions,
): Promise<void> {
  const client = await pool.connect();

  try {
    const adminUserId = await upsertBootstrapAdminUser(client, options);
    await upsertGlobalPreset(client, options);
    await upsertSeedDocuments(client, adminUserId, options);
  } finally {
    client.release();
  }
}

async function upsertBootstrapAdminUser(
  client: PoolClient,
  options: RunSeedOptions,
): Promise<string> {
  const normalizedEmail = options.adminEmail.trim().toLowerCase();
  const existing = await client.query<ExistingUserRow>(
    `
      SELECT id, email, password_hash
      FROM users
      WHERE lower(email) = $1
      LIMIT 1
    `,
    [normalizedEmail],
  );

  if (existing.rows[0]) {
    const row = existing.rows[0];
    const passwordMatches = await verifyPassword(
      options.adminPassword,
      row.password_hash,
    );

    if (!passwordMatches || row.email !== normalizedEmail) {
      const passwordHash = await hashPassword(options.adminPassword);
      await client.query(
        `
          UPDATE users
          SET email = $1,
              password_hash = $2
          WHERE id = $3
        `,
        [normalizedEmail, passwordHash, row.id],
      );
    }

    return row.id;
  }

  const passwordHash = await hashPassword(options.adminPassword);
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id
    `,
    [normalizedEmail, passwordHash],
  );

  return inserted.rows[0].id;
}

async function upsertGlobalPreset(
  client: PoolClient,
  options: RunSeedOptions,
): Promise<void> {
  const preset = getSeedPreset();
  const definition = buildContentReviewPresetDefinition({
    contentQueue: options.contentQueue,
    reviewQueue: options.reviewQueue,
  });

  await client.query(
    `
      INSERT INTO pipeline_presets (id, user_id, name, steps, is_active)
      VALUES ($1, NULL, $2, $3, TRUE)
      ON CONFLICT (id) DO UPDATE
      SET user_id = NULL,
          name = EXCLUDED.name,
          steps = EXCLUDED.steps,
          is_active = EXCLUDED.is_active
    `,
    [CONTENT_REVIEW_V1_PRESET_ID, preset.name, definition],
  );
}

async function upsertSeedDocuments(
  client: PoolClient,
  adminUserId: string,
  options: RunSeedOptions,
): Promise<void> {
  for (const document of getSeedRagDocuments()) {
    const embedding = await embedTextWithOllama({
      baseUrl: options.ollamaBaseUrl,
      model: options.ollamaEmbedModel,
      text: document.content,
    });

    if (embedding.length !== options.embeddingDim) {
      throw new Error(
        `Document ${document.id} embedding dimension mismatch. Expected ${options.embeddingDim}, received ${embedding.length}.`,
      );
    }

    await client.query(
      `
        INSERT INTO rag_documents (
          id,
          user_id,
          doc_type,
          platform,
          structure,
          tags,
          source,
          content,
          metadata,
          embedding
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10::vector
        )
        ON CONFLICT (id) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            doc_type = EXCLUDED.doc_type,
            platform = EXCLUDED.platform,
            structure = EXCLUDED.structure,
            tags = EXCLUDED.tags,
            source = EXCLUDED.source,
            content = EXCLUDED.content,
            metadata = EXCLUDED.metadata,
            embedding = EXCLUDED.embedding
      `,
      [
        document.id,
        adminUserId,
        document.docType,
        document.platform,
        document.structure,
        document.tags,
        document.source,
        document.content,
        document.metadata,
        toVectorLiteral(embedding),
      ],
    );
  }
}

function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}
