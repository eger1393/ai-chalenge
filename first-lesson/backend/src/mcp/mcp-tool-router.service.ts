import { Injectable } from '@nestjs/common';
import { McpRegistryService } from './mcp-registry.service';

@Injectable()
export class McpToolRouter {
  constructor(private readonly registry: McpRegistryService) {}

  async executeTool(prefixedName: string, args: Record<string, unknown>): Promise<string> {
    const resolved = this.registry.resolveToolName(prefixedName);
    if (!resolved) throw new Error(`Unknown MCP tool: ${prefixedName}`);

    const connection = this.registry.getConnection(resolved.serverName);
    if (!connection) throw new Error(`MCP server not found: ${resolved.serverName}`);

    return connection.callTool(resolved.originalName, args);
  }

  getServerMetaForTool(prefixedName: string): { serverName: string; displayName: string; icon: string; color: string } | undefined {
    const resolved = this.registry.resolveToolName(prefixedName);
    if (!resolved) return undefined;
    const meta = this.registry.getServerMeta(resolved.serverName);
    if (!meta) return undefined;
    return { serverName: resolved.serverName, ...meta };
  }
}
