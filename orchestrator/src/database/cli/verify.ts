import { loadEnv } from '../../config/env.validation';
import { runVerification } from '../verify';

async function main(): Promise<void> {
  const env = loadEnv();
  await runVerification({
    connectionString: env.DATABASE_URL,
    embeddingDim: env.EMBEDDING_DIM,
    adminEmail: env.AUTH_BOOTSTRAP_ADMIN_EMAIL,
  });
  console.log('Database bootstrap verification completed successfully.');
}

main().catch((error: unknown) => {
  console.error('Database bootstrap verification failed.', error);
  process.exit(1);
});
