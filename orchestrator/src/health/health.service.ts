import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { Client } from 'pg';

type ReadinessPayload = {
  status: 'ok' | 'error';
  dependencies: {
    postgres: 'ok' | 'error';
    rabbitmq: 'ok' | 'error';
    ollama: 'ok' | 'error';
    models: Record<string, boolean>;
    queues: Record<string, boolean>;
  };
  error?: string;
};

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
    model?: string;
  }>;
};

@Injectable()
export class HealthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly configService: ConfigService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureQueues();
  }

  getLiveness(): { status: 'ok'; service: 'orchestrator' } {
    return { status: 'ok', service: 'orchestrator' };
  }

  async getReadiness(): Promise<ReadinessPayload> {
    const models = this.getRequiredModels();
    const queueNames = this.getQueueNames();
    const payload: ReadinessPayload = {
      status: 'ok',
      dependencies: {
        postgres: 'error',
        rabbitmq: 'error',
        ollama: 'error',
        models: Object.fromEntries(models.map((model) => [model, false])),
        queues: Object.fromEntries(queueNames.map((queue) => [queue, false])),
      },
    };

    try {
      await this.checkPostgres();
      payload.dependencies.postgres = 'ok';

      await this.checkRabbitQueues();
      payload.dependencies.rabbitmq = 'ok';
      payload.dependencies.queues = Object.fromEntries(
        queueNames.map((queue) => [queue, true]),
      );

      const availableModels = await this.fetchOllamaModelNames();
      payload.dependencies.ollama = 'ok';
      payload.dependencies.models = Object.fromEntries(
        models.map((model) => [
          model,
          this.isModelAvailable(model, availableModels),
        ]),
      );

      if (!models.every((model) => this.isModelAvailable(model, availableModels))) {
        payload.status = 'error';
        payload.error = 'One or more Ollama models are missing.';
      }
    } catch (error) {
      payload.status = 'error';
      payload.error =
        error instanceof Error ? error.message : 'Unknown readiness failure.';
      this.logger.error(payload.error);
    }

    return payload;
  }

  private getQueueNames(): string[] {
    return [
      this.configService.getOrThrow<string>('CONTENT_RPC_QUEUE'),
      this.configService.getOrThrow<string>('REVIEW_RPC_QUEUE'),
      this.configService.getOrThrow<string>('STEP_DLQ_QUEUE'),
    ];
  }

  private getRequiredModels(): string[] {
    return [
      this.configService.getOrThrow<string>('OLLAMA_MAIN_MODEL'),
      this.configService.getOrThrow<string>('OLLAMA_REPAIR_MODEL'),
      this.configService.getOrThrow<string>('OLLAMA_EMBED_MODEL'),
    ];
  }

  private async checkPostgres(): Promise<void> {
    const client = new Client({
      connectionString: this.configService.getOrThrow<string>('DATABASE_URL'),
    });

    await client.connect();
    await client.query('SELECT 1');
    await client.end();
  }

  private async ensureQueues(): Promise<void> {
    const connection = await amqp.connect(
      this.configService.getOrThrow<string>('AMQP_URL'),
    );
    const channel = await connection.createChannel();

    try {
      for (const queueName of this.getQueueNames()) {
        await channel.assertQueue(queueName, { durable: true });
      }
    } finally {
      await channel.close();
      await connection.close();
    }
  }

  private async checkRabbitQueues(): Promise<void> {
    const connection = await amqp.connect(
      this.configService.getOrThrow<string>('AMQP_URL'),
    );
    const channel = await connection.createChannel();

    try {
      for (const queueName of this.getQueueNames()) {
        await channel.checkQueue(queueName);
      }
    } finally {
      await channel.close();
      await connection.close();
    }
  }

  private async fetchOllamaModelNames(): Promise<Set<string>> {
    const response = await fetch(
      `${this.configService.getOrThrow<string>('OLLAMA_BASE_URL')}/api/tags`,
    );

    if (!response.ok) {
      throw new Error(`Ollama API returned ${response.status}.`);
    }

    const payload = (await response.json()) as OllamaTagsResponse;
    const modelNames =
      payload.models
        ?.map((item) => item.name ?? item.model)
        .filter((value): value is string => Boolean(value)) ?? [];

    return new Set(modelNames);
  }

  private isModelAvailable(
    requestedModel: string,
    availableModels: Set<string>,
  ): boolean {
    for (const candidate of this.expandModelAliases(requestedModel)) {
      if (availableModels.has(candidate)) {
        return true;
      }
    }

    return false;
  }

  private expandModelAliases(modelName: string): Set<string> {
    const aliases = new Set<string>([modelName]);

    if (!modelName.includes(':')) {
      aliases.add(`${modelName}:latest`);
    }

    if (modelName.endsWith(':latest')) {
      aliases.add(modelName.slice(0, -7));
    }

    return aliases;
  }
}
