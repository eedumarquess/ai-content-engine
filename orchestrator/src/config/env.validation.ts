import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  ORCHESTRATOR_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  AMQP_URL: z.string().min(1),
  OLLAMA_BASE_URL: z.string().url(),
  OLLAMA_MAIN_MODEL: z.string().min(1),
  OLLAMA_REPAIR_MODEL: z.string().min(1),
  OLLAMA_EMBED_MODEL: z.string().min(1),
  EMBEDDING_DIM: z.coerce.number().int().positive(),
  CONTENT_RPC_QUEUE: z.string().min(1),
  REVIEW_RPC_QUEUE: z.string().min(1),
  STEP_DLQ_QUEUE: z.string().min(1),
  AUTH_REALM: z.string().min(1),
  AUTH_BOOTSTRAP_ADMIN_EMAIL: z.string().email(),
  AUTH_BOOTSTRAP_ADMIN_PASSWORD: z.string().min(1),
});

export type OrchestratorEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): OrchestratorEnv {
  return envSchema.parse(config);
}

export function loadEnv(
  config: Record<string, unknown> = process.env,
): OrchestratorEnv {
  return validateEnv(config);
}
