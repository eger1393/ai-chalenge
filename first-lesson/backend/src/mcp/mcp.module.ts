import { Global, Module } from '@nestjs/common';
import { McpRegistryService } from './mcp-registry.service';
import { McpToolRouter } from './mcp-tool-router.service';

@Global()
@Module({
  providers: [McpRegistryService, McpToolRouter],
  exports: [McpRegistryService, McpToolRouter],
})
export class McpModule {}
