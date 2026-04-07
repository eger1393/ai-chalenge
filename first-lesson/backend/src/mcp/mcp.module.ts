import { Global, Module } from '@nestjs/common';
import { McpClientService } from './mcp-client.service';

@Global()
@Module({
  providers: [McpClientService],
  exports: [McpClientService],
})
export class McpModule {}
