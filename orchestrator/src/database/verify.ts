import type { Pool } from 'pg';

import { createDatabasePool } from './client';
import {
  CONTENT_REVIEW_V1_PRESET_ID,
  SEEDED_RAG_DOCUMENT_IDS,
  SYNTHETIC_OTHER_USER_ID,
} from './constants';

type VerifyOptions = {
  connectionString: string;
  embeddingDim: number;
  adminEmail: string;
};

type UserRow = {
  id: string;
};

type RagDocumentRow = {
  id: string;
  user_id: string;
  embedding_text: string;
};

export async function runVerification(
  options: VerifyOptions,
): Promise<void> {
  const pool = createDatabasePool(options.connectionString);

  try {
    await runVerificationWithPool(pool, options);
  } finally {
    await pool.end();
  }
}

export async function runVerificationWithPool(
  pool: Pool,
  options: VerifyOptions,
): Promise<void> {
  await assertRelations(pool);
  await assertIndexes(pool);
  await assertSeededData(pool, options);
}

async function assertRelations(pool: Pool): Promise<void> {
  const requiredRelations = [
    'schema_migrations',
    'users',
    'pipeline_presets',
    'generations',
    'generation_steps',
    'rag_documents',
    'llm_traces',
    'generation_costs',
    'performance_events',
  ];

  for (const relation of requiredRelations) {
    const result = await pool.query<{ relation_name: string | null }>(
      'SELECT to_regclass($1) AS relation_name',
      [`public.${relation}`],
    );

    if (!result.rows[0]?.relation_name) {
      throw new Error(`Missing required relation public.${relation}.`);
    }
  }
}

async function assertIndexes(pool: Pool): Promise<void> {
  const requiredIndexes = [
    'users_email_lower_unique_idx',
    'rag_documents_type_idx',
    'rag_documents_user_idx',
    'rag_documents_platform_idx',
    'rag_documents_tags_gin_idx',
    'rag_documents_embedding_idx',
    'generations_user_created_at_idx',
    'generation_steps_generation_idx',
    'llm_traces_generation_idx',
    'performance_events_user_created_at_idx',
    'performance_events_platform_created_at_idx',
  ];

  for (const indexName of requiredIndexes) {
    const result = await pool.query<{ relation_name: string | null }>(
      'SELECT to_regclass($1) AS relation_name',
      [`public.${indexName}`],
    );

    if (!result.rows[0]?.relation_name) {
      throw new Error(`Missing required index public.${indexName}.`);
    }
  }
}

async function assertSeededData(
  pool: Pool,
  options: VerifyOptions,
): Promise<void> {
  const normalizedEmail = options.adminEmail.trim().toLowerCase();
  const adminResult = await pool.query<UserRow>(
    `
      SELECT id
      FROM users
      WHERE lower(email) = $1
      LIMIT 1
    `,
    [normalizedEmail],
  );

  const admin = adminResult.rows[0];

  if (!admin) {
    throw new Error(`Bootstrap admin user ${normalizedEmail} was not seeded.`);
  }

  const presetVisibleToAdmin = await pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM pipeline_presets
      WHERE id = $1
        AND is_active = TRUE
        AND (user_id IS NULL OR user_id = $2)
    `,
    [CONTENT_REVIEW_V1_PRESET_ID, admin.id],
  );

  if (Number(presetVisibleToAdmin.rows[0]?.count ?? 0) !== 1) {
    throw new Error('Seeded pipeline preset is not visible to the admin user.');
  }

  const presetVisibleToOtherUser = await pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM pipeline_presets
      WHERE id = $1
        AND is_active = TRUE
        AND (user_id IS NULL OR user_id = $2)
    `,
    [CONTENT_REVIEW_V1_PRESET_ID, SYNTHETIC_OTHER_USER_ID],
  );

  if (Number(presetVisibleToOtherUser.rows[0]?.count ?? 0) !== 1) {
    throw new Error('Seeded pipeline preset is not visible to a different user.');
  }

  const seededDocuments = await pool.query<RagDocumentRow>(
    `
      SELECT id, user_id, embedding::text AS embedding_text
      FROM rag_documents
      WHERE id = ANY($1::uuid[])
      ORDER BY id
    `,
    [Array.from(SEEDED_RAG_DOCUMENT_IDS)],
  );

  if (seededDocuments.rows.length !== SEEDED_RAG_DOCUMENT_IDS.length) {
    throw new Error('One or more seeded rag documents are missing.');
  }

  for (const row of seededDocuments.rows) {
    if (row.user_id !== admin.id) {
      throw new Error(
        `Seeded rag document ${row.id} is not owned by the bootstrap admin.`,
      );
    }

    const dimension = getVectorDimension(row.embedding_text);

    if (dimension !== options.embeddingDim) {
      throw new Error(
        `Seeded rag document ${row.id} has dimension ${dimension}, expected ${options.embeddingDim}.`,
      );
    }
  }

  const visibleDocumentsForOtherUser = await pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM rag_documents
      WHERE id = ANY($1::uuid[])
        AND (user_id IS NULL OR user_id = $2)
    `,
    [Array.from(SEEDED_RAG_DOCUMENT_IDS), SYNTHETIC_OTHER_USER_ID],
  );

  if (Number(visibleDocumentsForOtherUser.rows[0]?.count ?? 0) !== 0) {
    throw new Error(
      'Seeded persona/knowledge documents should not be visible to a different user.',
    );
  }
}

function getVectorDimension(rawVector: string): number {
  const normalized = rawVector.trim();

  if (normalized.length < 2) {
    return 0;
  }

  const body = normalized.slice(1, -1).trim();

  if (body.length === 0) {
    return 0;
  }

  return body.split(',').length;
}
