export const initialSchemaMigration = {
  filename: '001_initial_schema.sql',
  renderSql: (embeddingDim: number): string => `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL CHECK (length(trim(email)) > 0),
  password_hash TEXT NOT NULL CHECK (length(trim(password_hash)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique_idx
ON users ((lower(email)));

CREATE TABLE IF NOT EXISTS pipeline_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES users(id),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  steps JSONB NOT NULL CHECK (jsonb_typeof(steps) = 'object'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_presets_user_idx
ON pipeline_presets (user_id);

CREATE TABLE IF NOT EXISTS generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  pipeline_preset_id UUID NULL REFERENCES pipeline_presets(id),
  topic TEXT NOT NULL CHECK (length(trim(topic)) > 0),
  platform TEXT NOT NULL CHECK (length(trim(platform)) > 0),
  format TEXT NOT NULL CHECK (length(trim(format)) > 0),
  pipeline JSONB NOT NULL CHECK (jsonb_typeof(pipeline) = 'object'),
  schema_version TEXT NOT NULL DEFAULT 'v1' CHECK (length(trim(schema_version)) > 0),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  result_json JSONB NULL,
  error_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  CHECK (result_json IS NULL OR jsonb_typeof(result_json) = 'object'),
  CHECK (error_json IS NULL OR jsonb_typeof(error_json) = 'object')
);

CREATE INDEX IF NOT EXISTS generations_user_created_at_idx
ON generations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS generations_pipeline_preset_idx
ON generations (pipeline_preset_id);

CREATE TABLE IF NOT EXISTS generation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL CHECK (length(trim(step_name)) > 0),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'dlq')),
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  input_json JSONB NOT NULL CHECK (jsonb_typeof(input_json) = 'object'),
  output_json JSONB NULL,
  error_json JSONB NULL,
  reply_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(reply_metadata) = 'object'),
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  CHECK (output_json IS NULL OR jsonb_typeof(output_json) = 'object'),
  CHECK (error_json IS NULL OR jsonb_typeof(error_json) = 'object'),
  UNIQUE(generation_id, step_name)
);

CREATE INDEX IF NOT EXISTS generation_steps_generation_idx
ON generation_steps (generation_id);

CREATE TABLE IF NOT EXISTS rag_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES users(id),
  doc_type TEXT NOT NULL CHECK (doc_type IN ('persona', 'knowledge', 'performance')),
  platform TEXT NULL,
  structure TEXT NULL,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  source TEXT NULL,
  content TEXT NOT NULL CHECK (length(trim(content)) > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  embedding VECTOR(${embeddingDim}) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rag_documents_embedding_idx
ON rag_documents
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS rag_documents_type_idx
ON rag_documents (doc_type);

CREATE INDEX IF NOT EXISTS rag_documents_user_idx
ON rag_documents (user_id);

CREATE INDEX IF NOT EXISTS rag_documents_platform_idx
ON rag_documents (platform);

CREATE INDEX IF NOT EXISTS rag_documents_tags_gin_idx
ON rag_documents
USING GIN (tags);

CREATE TABLE IF NOT EXISTS llm_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL CHECK (length(trim(step_name)) > 0),
  agent_name TEXT NOT NULL CHECK (length(trim(agent_name)) > 0),
  provider TEXT NOT NULL CHECK (length(trim(provider)) > 0),
  model TEXT NOT NULL CHECK (length(trim(model)) > 0),
  prompt_version TEXT NOT NULL CHECK (length(trim(prompt_version)) > 0),
  prompt_text TEXT NOT NULL CHECK (length(trim(prompt_text)) > 0),
  retrieved_doc_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  retrieved_docs_preview JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(retrieved_docs_preview) = 'array'),
  tokens_in INT NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
  tokens_out INT NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  latency_ms INT NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  output_json JSONB NULL,
  error_json JSONB NULL,
  otel_trace_id TEXT NULL,
  otel_span_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (output_json IS NULL OR jsonb_typeof(output_json) = 'object'),
  CHECK (error_json IS NULL OR jsonb_typeof(error_json) = 'object')
);

CREATE INDEX IF NOT EXISTS llm_traces_generation_idx
ON llm_traces (generation_id);

CREATE INDEX IF NOT EXISTS llm_traces_step_idx
ON llm_traces (step_name);

CREATE TABLE IF NOT EXISTS generation_costs (
  generation_id UUID PRIMARY KEY REFERENCES generations(id) ON DELETE CASCADE,
  total_tokens_in INT NOT NULL DEFAULT 0 CHECK (total_tokens_in >= 0),
  total_tokens_out INT NOT NULL DEFAULT 0 CHECK (total_tokens_out >= 0),
  total_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0 CHECK (total_cost_usd >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS performance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  generation_id UUID NULL REFERENCES generations(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (length(trim(platform)) > 0),
  post_id TEXT NULL,
  metrics JSONB NOT NULL CHECK (jsonb_typeof(metrics) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS performance_events_user_created_at_idx
ON performance_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS performance_events_platform_created_at_idx
ON performance_events (platform, created_at DESC);

CREATE INDEX IF NOT EXISTS performance_events_generation_idx
ON performance_events (generation_id);
`,
} as const;
