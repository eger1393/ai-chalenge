import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v3';
import { GitHubApiError } from './github-api.js';
import { searchRepos } from './tools/search-repos.js';
import { getDescription } from './tools/get-description.js';
import { listBranches } from './tools/list-branches.js';
import { getCommits } from './tools/get-commits.js';

const server = new McpServer({
  name: 'github-explorer',
  version: '1.0.0',
});

function handleError(error: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  const message = error instanceof GitHubApiError ? error.message : 'Internal error';
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: true, message }) }],
    isError: true,
  };
}

server.tool(
  'search_repos',
  'Search GitHub repositories by query',
  {
    query: z.string().describe('Search query for GitHub repositories'),
  },
  async (args) => {
    try {
      const result = await searchRepos(args);
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      return handleError(error);
    }
  }
);

server.tool(
  'get_description',
  'Get description and metadata of a GitHub repository',
  {
    repository: z.string().describe('Repository in format owner/repo or full GitHub URL'),
  },
  async (args) => {
    try {
      const result = await getDescription(args);
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      return handleError(error);
    }
  }
);

server.tool(
  'list_branches',
  'List branches of a GitHub repository',
  {
    repository: z.string().describe('Repository in format owner/repo or full GitHub URL'),
  },
  async (args) => {
    try {
      const result = await listBranches(args);
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      return handleError(error);
    }
  }
);

server.tool(
  'get_commits',
  'Get recent commits from a GitHub repository',
  {
    repository: z.string().describe('Repository in format owner/repo or full GitHub URL'),
    branch: z.string().optional().describe('Branch name (defaults to repo default branch)'),
    limit: z.number().optional().describe('Number of commits (1-100, default 100)'),
  },
  async (args) => {
    try {
      const result = await getCommits(args);
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      return handleError(error);
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Failed to start github-explorer MCP server:', error);
  process.exit(1);
});
