import { loadEnv } from '../../config/env.validation';
import { runMigrations } from '../migrate';

async function main(): Promise<void> {
  const env = loadEnv();
  await runMigrations({
    connectionString: env.DATABASE_URL,
    embeddingDim: env.EMBEDDING_DIM,
  });
  console.log('Database migrations applied successfully.');
}

main().catch((error: unknown) => {
  console.error('Database migration failed.', error);
  process.exit(1);
});
