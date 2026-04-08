import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v3';
import { GitHubApiError } from './github-api.js';
import { searchRepos } from './tools/search-repos.js';
import { getDescription } from './tools/get-description.js';
import { listBranches } from './tools/list-branches.js';
import { getCommits } from './tools/get-commits.js';
import { checkNewIssues } from './tools/check-new-issues.js';
import { subscribeToIssues } from './tools/subscribe-to-issues.js';
import { listSubscriptions } from './tools/list-subscriptions.js';
import { initDb } from './db.js';
import { startPoller } from './poller.js';

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

server.tool(
  'check_new_issues',
  'Check for new issues in a GitHub repository since a given timestamp. Returns issues created after the specified date.',
  {
    repository: z.string().describe('Repository in format owner/repo'),
    since: z.string().describe('ISO 8601 timestamp to check issues from'),
  },
  async (args) => {
    try {
      const result = await checkNewIssues(args);
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      return handleError(error);
    }
  }
);

server.tool(
  'subscribe_to_issues',
  'Subscribe to new issues in a GitHub repository. Polls periodically and sends notifications via callback.',
  {
    repository: z.string().describe('Repository in format owner/repo'),
    conversation_id: z.string().describe('UUID of the conversation to associate the subscription with'),
    user_id: z.string().describe('UUID of the user creating the subscription'),
    ttl_minutes: z.number().optional().describe('Subscription lifetime in minutes (default 1440 = 24h)'),
  },
  async (args) => {
    try {
      const result = await subscribeToIssues(args);
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      return handleError(error);
    }
  }
);

server.tool(
  'list_subscriptions',
  'List active issue subscriptions for a conversation',
  {
    conversation_id: z.string().describe('UUID of the conversation'),
  },
  async (args) => {
    try {
      const result = await listSubscriptions(args);
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      return handleError(error);
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  await initDb();
  startPoller();
}

main().catch((error) => {
  console.error('Failed to start github-explorer MCP server:', error);
  process.exit(1);
});
