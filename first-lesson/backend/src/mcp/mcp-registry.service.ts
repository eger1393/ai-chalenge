import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { McpConnection, McpToolDefinition } from './mcp-connection';

interface ServerConfig {
  url: string;
  displayName: string;
  icon: string;
  color: string;
  enabled: boolean;
  exposeTools?: boolean;
  hiddenTools?: string[];
}

interface McpServersFile {
  servers: Record<string, ServerConfig>;
}

@Injectable()
export class McpRegistryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpRegistryService.name);
  private connections = new Map<string, McpConnection>();
  private toolCatalog: OpenAI.Chat.Completions.ChatCompletionTool[] = [];
  private toolToServer = new Map<string, { serverName: string; originalName: string }>();
  private serverConfigs = new Map<string, ServerConfig>();

  async onModuleInit(): Promise<void> {
    const configPath = path.resolve(__dirname, '..', '..', 'mcp-servers.json');

    let raw: string;
    try {
      raw = fs.readFileSync(configPath, 'utf-8');
    } catch {
      this.logger.warn(`mcp-servers.json not found at ${configPath}, starting with 0 MCP servers`);
      return;
    }

    let config: McpServersFile;
    try {
      config = JSON.parse(raw) as McpServersFile;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      this.logger.error(`Failed to parse mcp-servers.json: ${msg}`);
      return;
    }

    for (const [name, serverCfg] of Object.entries(config.servers)) {
      if (!serverCfg.enabled) {
        this.logger.log(`MCP server "${name}" is disabled, skipping`);
        continue;
      }

      const resolvedUrl = serverCfg.url.replace(/\$\{(\w+)\}/g, (_match, envVar: string) => {
        return process.env[envVar] || '';
      });

      if (!resolvedUrl) {
        this.logger.warn(`MCP server "${name}": URL resolved to empty (env var not set), skipping`);
        continue;
      }

      this.serverConfigs.set(name, { ...serverCfg, url: resolvedUrl });

      const connection = new McpConnection(name, resolvedUrl);
      this.connections.set(name, connection);
    }

    await this.refreshToolCatalog();
  }

  async refreshToolCatalog(): Promise<void> {
    this.toolCatalog = [];
    this.toolToServer.clear();

    for (const [serverName, connection] of this.connections.entries()) {
      const config = this.serverConfigs.get(serverName);
      if (!config) continue;

      let tools: McpToolDefinition[];
      try {
        tools = await connection.listTools();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        this.logger.warn(`Failed to list tools from MCP server "${serverName}": ${msg}`);
        continue;
      }

      if (tools.length === 0) {
        this.logger.warn(`MCP server "${serverName}" returned 0 tools`);
        continue;
      }

      this.logger.log(`MCP server "${serverName}" provides ${tools.length} tool(s)`);

      if (config.exposeTools === false) {
        this.logger.log(`Инструменты MCP-сервера "${serverName}" скрыты от модели`);
        continue;
      }

      const hidden = new Set(config.hiddenTools || []);

      for (const tool of tools) {
        const prefixedName = `${serverName}__${tool.name}`;

        this.toolToServer.set(prefixedName, {
          serverName,
          originalName: tool.name,
        });

        if (hidden.has(tool.name)) continue;

        this.toolCatalog.push({
          type: 'function',
          function: {
            name: prefixedName,
            description: `[${config.displayName}] ${tool.description || tool.name}`,
            parameters: (tool.inputSchema || { type: 'object', properties: {} }) as OpenAI.FunctionParameters,
          },
        });
      }
    }

    this.logger.log(`Tool catalog refreshed: ${this.toolCatalog.length} tool(s) from ${this.connections.size} server(s)`);
  }

  getAllToolsForOpenAI(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return this.toolCatalog;
  }

  isAvailable(): boolean {
    return this.connections.size > 0 && this.toolCatalog.length > 0;
  }

  getConnection(serverName: string): McpConnection | undefined {
    return this.connections.get(serverName);
  }

  resolveToolName(prefixedName: string): { serverName: string; originalName: string } | undefined {
    return this.toolToServer.get(prefixedName);
  }

  getServerMeta(serverName: string): { displayName: string; icon: string; color: string } | undefined {
    const config = this.serverConfigs.get(serverName);
    if (!config) return undefined;
    return { displayName: config.displayName, icon: config.icon, color: config.color };
  }

  buildCapabilitiesBlock(): string {
    if (!this.isAvailable()) return '';

    let block = '\n\n═══ ДОСТУПНЫЕ ИНСТРУМЕНТЫ ═══\n';

    for (const [serverName, config] of this.serverConfigs.entries()) {
      const tools = this.toolCatalog.filter((t) =>
        t.function.name.startsWith(`${serverName}__`),
      );
      if (tools.length === 0) continue;

      block += `\n[${config.displayName}]:\n`;
      for (const tool of tools) {
        const desc = tool.function.description || tool.function.name;
        block += `- ${tool.function.name} — ${desc}\n`;
      }
    }

    block += '\nУчитывай наличие этих инструментов при планировании и оценке.\n';
    block += '═════════════════════════════\n';
    return block;
  }

  getServerStatuses(): Array<{
    name: string;
    displayName: string;
    icon: string;
    color: string;
    connected: boolean;
    toolCount: number;
  }> {
    const statuses: Array<{
      name: string;
      displayName: string;
      icon: string;
      color: string;
      connected: boolean;
      toolCount: number;
    }> = [];

    for (const [serverName, config] of this.serverConfigs.entries()) {
      const toolCount = this.toolCatalog.filter((t) =>
        t.function.name.startsWith(`${serverName}__`),
      ).length;

      statuses.push({
        name: serverName,
        displayName: config.displayName,
        icon: config.icon,
        color: config.color,
        connected: this.connections.has(serverName),
        toolCount,
      });
    }

    return statuses;
  }

  async onModuleDestroy(): Promise<void> {
    for (const [name, connection] of this.connections.entries()) {
      try {
        await connection.disconnect();
        this.logger.log(`MCP connection "${name}" disconnected`);
      } catch {
        // ignore
      }
    }
  }
}
