import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';

import type { DlqMessage } from './rabbit.types';

@Injectable()
export class RabbitDlqService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureInitialized();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
      this.channel = null;
    }

    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }

  async publishTerminalFailure(payload: DlqMessage): Promise<void> {
    await this.ensureInitialized();

    if (!this.channel) {
      throw new Error('Rabbit DLQ publisher is not initialized.');
    }

    this.channel.sendToQueue(
      this.configService.getOrThrow<string>('STEP_DLQ_QUEUE'),
      Buffer.from(JSON.stringify(payload)),
      {
        contentType: 'application/json',
        persistent: true,
      },
    );
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }

    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    if (this.connection && this.channel) {
      return;
    }

    const connection = await amqp.connect(
      this.configService.getOrThrow<string>('AMQP_URL'),
    );
    const channel = await connection.createChannel();
    await channel.assertQueue(
      this.configService.getOrThrow<string>('STEP_DLQ_QUEUE'),
      { durable: true },
    );
    this.connection = connection;
    this.channel = channel;
  }
}
