import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import type { Channel, ChannelModel, ConsumeMessage, Replies } from 'amqplib';

type PendingReply = {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

@Injectable()
export class RabbitRpcClient
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RabbitRpcClient.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private replyQueue: Replies.AssertQueue | null = null;
  private readonly pendingReplies = new Map<string, PendingReply>();
  private initPromise: Promise<void> | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureInitialized();
  }

  async onApplicationShutdown(): Promise<void> {
    for (const pending of this.pendingReplies.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Rabbit RPC client is shutting down.'));
    }
    this.pendingReplies.clear();

    if (this.channel) {
      await this.channel.close();
      this.channel = null;
    }

    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }

  async sendRpc(
    queue: string,
    payload: unknown,
    options: {
      correlationId: string;
      timeoutMs: number;
    },
  ): Promise<unknown> {
    await this.ensureInitialized();

    if (!this.channel || !this.replyQueue) {
      throw new Error('Rabbit RPC client is not initialized.');
    }

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingReplies.delete(options.correlationId);
        reject(new Error(`RPC timeout after ${options.timeoutMs}ms.`));
      }, options.timeoutMs);

      this.pendingReplies.set(options.correlationId, {
        resolve,
        reject,
        timeout,
      });

      this.channel!.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
        correlationId: options.correlationId,
        replyTo: this.replyQueue!.queue,
        contentType: 'application/json',
        persistent: true,
      });
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }

    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    if (this.connection && this.channel && this.replyQueue) {
      return;
    }

    const connection = await amqp.connect(
      this.configService.getOrThrow<string>('AMQP_URL'),
    );
    const channel = await connection.createChannel();
    const replyQueue = await channel.assertQueue('', {
      exclusive: true,
      autoDelete: true,
    });
    this.connection = connection;
    this.channel = channel;
    this.replyQueue = replyQueue;

    await channel.consume(
      replyQueue.queue,
      (message) => this.handleReply(message),
      { noAck: true },
    );
  }

  private handleReply(message: ConsumeMessage | null): void {
    if (!message) {
      return;
    }

    const correlationId = message.properties.correlationId;

    if (!correlationId) {
      this.logger.warn('Discarding RabbitMQ RPC reply without correlation id.');
      return;
    }

    const pending = this.pendingReplies.get(correlationId);

    if (!pending) {
      this.logger.warn(
        `Discarding late or unknown RabbitMQ RPC reply for ${correlationId}.`,
      );
      return;
    }

    this.pendingReplies.delete(correlationId);
    clearTimeout(pending.timeout);

    try {
      pending.resolve(JSON.parse(message.content.toString('utf-8')) as unknown);
    } catch (error) {
      pending.reject(
        error instanceof Error ? error : new Error('Failed to parse RPC reply.'),
      );
    }
  }
}
