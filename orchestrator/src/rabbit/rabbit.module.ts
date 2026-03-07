import { Module } from '@nestjs/common';

import { RabbitDlqService } from './rabbit-dlq.service';
import { RabbitRpcClient } from './rabbit-rpc.client';

@Module({
  providers: [RabbitRpcClient, RabbitDlqService],
  exports: [RabbitRpcClient, RabbitDlqService],
})
export class RabbitModule {}
