import { loadEnv } from '../../config/env.validation';
import { runSeed } from '../seed';

async function main(): Promise<void> {
  const env = loadEnv();
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
  console.log('Database seed completed successfully.');
}

main().catch((error: unknown) => {
  console.error('Database seed failed.', error);
  process.exit(1);
});
