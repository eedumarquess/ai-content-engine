import { loadEnv } from '../../config/env.validation';
import { runMigrations } from '../migrate';
import { runSeed } from '../seed';
import { runVerification } from '../verify';

async function main(): Promise<void> {
  const env = loadEnv();

  await runMigrations({
    connectionString: env.DATABASE_URL,
    embeddingDim: env.EMBEDDING_DIM,
  });
  await runSeed({
    connectionString: env.DATABASE_URL,
    ollamaBaseUrl: env.OLLAMA_BASE_URL,
    ollamaEmbedModel: env.OLLAMA_EMBED_MODEL,
    embeddingDim: env.EMBEDDING_DIM,
    adminEmail: env.AUTH_BOOTSTRAP_ADMIN_EMAIL,
    adminPassword: env.AUTH_BOOTSTRAP_ADMIN_PASSWORD,
    contentQueue: env.CONTENT_RPC_QUEUE,
    reviewQueue: env.REVIEW_RPC_QUEUE,
  });
  await runVerification({
    connectionString: env.DATABASE_URL,
    embeddingDim: env.EMBEDDING_DIM,
    adminEmail: env.AUTH_BOOTSTRAP_ADMIN_EMAIL,
  });

  console.log('Database bootstrap completed successfully.');
}

main().catch((error: unknown) => {
  console.error('Database bootstrap failed.', error);
  process.exit(1);
});
