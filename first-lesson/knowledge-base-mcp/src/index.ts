import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v3';
import { initDb } from './db.js';
import { createEntry, replaceEntry } from './tools/create-entry.js';
import { deleteByTag } from './tools/delete-by-tag.js';
import { getByTag } from './tools/get-by-tag.js';
import { listTags } from './tools/list-tags.js';

const server = new McpServer({
  name: 'knowledge-base',
  version: '1.0.0',
});

const contentSchema = z.union([
  z.string(),
  z.record(z.unknown()),
  z.array(z.unknown()),
]);

function handleError(error: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  console.error('Tool error:', error);
  const message = error instanceof Error ? error.message : 'Internal error';
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: true, message }) }],
    isError: true,
  };
}

server.tool(
  'create_entry',
  'Create a knowledge-base entry with one or more unique tags. Tags are globally unique and every tag points to exactly one entry.',
  {
    tags: z.array(z.string()).min(1).describe('One or more unique tags for the entry'),
    content: contentSchema.describe('Entry content: either a non-empty text string or a structured JSON object/array'),
  },
  async (args) => {
    try {
      const result = await createEntry(args);
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      return handleError(error);
    }
  },
);

server.tool(
  'get_by_tag',
  'Get a knowledge-base entry by exact tag match.',
  {
    tag: z.string().describe('Exact tag to resolve'),
  },
  async (args) => {
    try {
      const result = await getByTag(args);
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      return handleError(error);
    }
  },
);

server.tool(
  'replace_by_tag',
  'Fully replace an existing knowledge-base entry addressed by any of its tags. Replacement updates both content and the full tag set.',
  {
    tag: z.string().describe('Any existing tag of the entry to replace'),
    tags: z.array(z.string()).min(1).describe('Complete replacement tag set for the entry'),
    content: contentSchema.describe('Replacement content: either a non-empty text string or a structured JSON object/array'),
  },
  async (args) => {
    try {
      const result = await replaceEntry(args);
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      return handleError(error);
    }
  },
);

server.tool(
  'delete_by_tag',
  'Delete an existing knowledge-base entry by any of its exact tags.',
  {
    tag: z.string().describe('Any existing tag of the entry to delete'),
  },
  async (args) => {
    try {
      const result = await deleteByTag(args);
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      return handleError(error);
    }
  },
);

server.tool(
  'list_tags',
  'List all currently available knowledge-base tags.',
  {},
  async () => {
    try {
      const result = await listTags();
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      return handleError(error);
    }
  },
);

async function main(): Promise<void> {
  await initDb();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Failed to start knowledge-base MCP server:', error);
  process.exit(1);
});
