import { Logger } from "@nestjs/common";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Client } = require("@modelcontextprotocol/sdk/client");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

interface McpCallToolResult {
  content: Array<{ type: string; text?: string }>;
}

interface McpListToolsResult {
  tools?: McpToolDefinition[];
}

interface McpTransport {
  onerror?: (error: Error) => void;
  onclose?: () => void;
}

interface McpClient {
  connect(transport: McpTransport): Promise<void>;
  close(): Promise<void>;
  callTool(params: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<McpCallToolResult>;
  listTools(): Promise<McpListToolsResult>;
}

export class McpConnection {
  private readonly logger: Logger;
  private client: McpClient | null = null;
  private transport: McpTransport | null = null;
  private connected = false;
  private connectPromise: Promise<void> | null = null;

  constructor(
    private readonly serverName: string,
    private readonly url: string,
  ) {
    this.logger = new Logger(`McpConnection:${serverName}`);
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected && this.client) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.connect().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async connect(): Promise<void> {
    this.logger.log(
      `Connecting to MCP server "${this.serverName}" at ${this.url}`,
    );

    try {
      await this.disconnect();

      this.transport = new StreamableHTTPClientTransport(new URL(this.url));

      this.transport.onerror = (error: Error) => {
        this.logger.error(`MCP transport error: ${error.message}`);
        this.connected = false;
      };

      this.transport.onclose = () => {
        this.logger.warn("MCP transport closed");
        this.connected = false;
      };

      this.client = new Client(
        { name: "nestjs-backend", version: "1.0.0" },
        { capabilities: {} },
      ) as McpClient;

      await this.client.connect(this.transport);
      this.connected = true;
      this.logger.log(
        `Connected to MCP server "${this.serverName}" successfully`,
      );
    } catch (error: unknown) {
      this.connected = false;
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        `Failed to connect to MCP server "${this.serverName}": ${message}`,
      );
      throw error;
    }
  }

  async disconnect(): Promise<void> {
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

  private async withReconnect<T>(operation: () => Promise<T>): Promise<T> {
    try {
      await this.ensureConnected();
      return await operation();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.warn(
        `MCP operation failed, attempting reconnect: ${message}`,
      );
      this.connected = false;

      try {
        await this.connect();
        return await operation();
      } catch (retryError: unknown) {
        const retryMessage =
          retryError instanceof Error ? retryError.message : "Unknown error";
        this.logger.error(
          `MCP operation failed after reconnect: ${retryMessage}`,
        );
        throw retryError;
      }
    }
  }

  async listTools(): Promise<McpToolDefinition[]> {
    return [];

    // return this.withReconnect(async () => {
    //   const result = await this.client!.listTools();
    //   return result.tools || [];
    // });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    return this.withReconnect(async () => {
      const result = await this.client!.callTool({ name, arguments: args });
      return this.extractTextContent(result);
    });
  }

  private extractTextContent(result: McpCallToolResult): string {
    if (!result.content || result.content.length === 0) {
      return "";
    }

    return result.content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text)
      .join("\n");
  }
}
