import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  ORCHESTRATOR_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  AMQP_URL: z.string().min(1),
  OLLAMA_BASE_URL: z.string().url(),
  OLLAMA_MAIN_MODEL: z.string().min(1),
  OLLAMA_REPAIR_MODEL: z.string().min(1),
  OLLAMA_EMBED_MODEL: z.string().min(1),
  CONTENT_RPC_QUEUE: z.string().min(1),
  REVIEW_RPC_QUEUE: z.string().min(1),
  STEP_DLQ_QUEUE: z.string().min(1),
});

export type OrchestratorEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): OrchestratorEnv {
  return envSchema.parse(config);
}

