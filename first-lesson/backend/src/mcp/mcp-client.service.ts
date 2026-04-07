import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

// The @modelcontextprotocol/sdk uses package.json "exports" which requires
// moduleResolution "node16" or "bundler". Since this project uses "commonjs",
// we use require() for runtime and keep type safety via inline typing.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Client } = require('@modelcontextprotocol/sdk/client');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');

/** Minimal type definitions for MCP Client used in this service */
interface McpCallToolResult {
  content: Array<{ type: string; text?: string }>;
}

interface McpTransport {
  onerror?: (error: Error) => void;
  onclose?: () => void;
}

interface McpClient {
  connect(transport: McpTransport): Promise<void>;
  close(): Promise<void>;
  callTool(params: { name: string; arguments: Record<string, unknown> }): Promise<McpCallToolResult>;
}

@Injectable()
export class McpClientService implements OnModuleDestroy {
  private readonly logger = new Logger(McpClientService.name);
  private client: McpClient | null = null;
  private transport: McpTransport | null = null;
  private connecting = false;
  private connected = false;

  private get mcpUrl(): string | undefined {
    return process.env.MCP_POSTGRES_URL;
  }

  /** Returns true if MCP_POSTGRES_URL is configured */
  isAvailable(): boolean {
    return !!this.mcpUrl;
  }

  /** Lazy connect: establishes connection on first call */
  private async ensureConnected(): Promise<void> {
    if (this.connected && this.client) return;
    if (this.connecting) {
      // Wait for ongoing connection attempt
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (!this.connecting) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
      return;
    }

    this.connecting = true;
    try {
      await this.connect();
    } finally {
      this.connecting = false;
    }
  }

  private async connect(): Promise<void> {
    const url = this.mcpUrl;
    if (!url) {
      throw new Error('MCP_POSTGRES_URL is not configured');
    }

    this.logger.log(`Connecting to MCP server at ${url}`);

    try {
      // Close previous connection if any
      await this.disconnect();

      this.transport = new SSEClientTransport(new URL(url));

      this.transport.onerror = (error: Error) => {
        this.logger.error(`MCP transport error: ${error.message}`);
        this.connected = false;
      };

      this.transport.onclose = () => {
        this.logger.warn('MCP transport closed');
        this.connected = false;
      };

      this.client = new Client(
        { name: 'nestjs-backend', version: '1.0.0' },
        { capabilities: {} },
      ) as McpClient;

      await this.client.connect(this.transport);
      this.connected = true;
      this.logger.log('Connected to MCP server successfully');
    } catch (error: unknown) {
      this.connected = false;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to connect to MCP server: ${message}`);
      throw error;
    }
  }

  private async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
      }
    } catch {
      // ignore close errors
    }
    this.client = null;
    this.transport = null;
    this.connected = false;
  }

  /** Reconnect on failure, then retry the operation once */
  private async withReconnect<T>(operation: () => Promise<T>): Promise<T> {
    try {
      await this.ensureConnected();
      return await operation();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`MCP operation failed, attempting reconnect: ${message}`);
      this.connected = false;

      try {
        await this.connect();
        return await operation();
      } catch (retryError: unknown) {
        const retryMessage = retryError instanceof Error ? retryError.message : 'Unknown error';
        this.logger.error(`MCP operation failed after reconnect: ${retryMessage}`);
        throw retryError;
      }
    }
  }

  /** Lists all tables in the database */
  async listTables(): Promise<string> {
    if (!this.isAvailable()) {
      return 'MCP PostgreSQL is not configured';
    }

    return this.withReconnect(async () => {
      const result = await this.client!.callTool({ name: 'list_tables', arguments: {} });
      return this.extractTextContent(result);
    });
  }

  /** Executes a read-only SQL query via MCP */
  async query(sql: string): Promise<string> {
    if (!this.isAvailable()) {
      return 'MCP PostgreSQL is not configured';
    }

    return this.withReconnect(async () => {
      const result = await this.client!.callTool({ name: 'query', arguments: { sql } });
      return this.extractTextContent(result);
    });
  }

  private extractTextContent(result: McpCallToolResult): string {
    if (!result.content || result.content.length === 0) {
      return '';
    }

    return result.content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n');
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
    this.logger.log('MCP client disconnected on module destroy');
  }
}
