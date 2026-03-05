type OllamaEmbedRequest = {
  baseUrl: string;
  model: string;
  text: string;
};

type OllamaEmbedResponse = {
  embedding?: unknown;
  embeddings?: unknown;
};

export async function embedTextWithOllama(
  options: OllamaEmbedRequest,
): Promise<number[]> {
  const attempts = [
    {
      path: '/api/embed',
      body: {
        model: options.model,
        input: options.text,
      },
    },
    {
      path: '/api/embeddings',
      body: {
        model: options.model,
        prompt: options.text,
      },
    },
  ];

  const errors: string[] = [];

  for (const attempt of attempts) {
    const response = await fetch(
      `${trimTrailingSlash(options.baseUrl)}${attempt.path}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(attempt.body),
      },
    );

    if (!response.ok) {
      errors.push(`${attempt.path} returned ${response.status}`);
      continue;
    }

    const payload = (await response.json()) as OllamaEmbedResponse;
    const embedding = extractEmbedding(payload);

    if (embedding) {
      return embedding;
    }

    errors.push(`${attempt.path} returned an unexpected payload`);
  }

  throw new Error(
    `Unable to generate embeddings through Ollama. Attempts: ${errors.join('; ')}`,
  );
}

function extractEmbedding(payload: OllamaEmbedResponse): number[] | null {
  if (isNumberArray(payload.embedding)) {
    return payload.embedding;
  }

  if (
    Array.isArray(payload.embeddings) &&
    payload.embeddings.length > 0 &&
    isNumberArray(payload.embeddings[0])
  ) {
    return payload.embeddings[0];
  }

  return null;
}

function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
