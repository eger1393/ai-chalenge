import { githubGet, GitHubApiError } from '../github-api.js';
import { parseRepository } from '../utils/parse-repository.js';

interface GitHubLabel {
  name: string;
  color: string;
}

interface GitHubIssueResponse {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  user: { login: string } | null;
  labels: GitHubLabel[];
  created_at: string;
  pull_request?: unknown;
}

export async function checkNewIssues(args: {
  repository: string;
  since: string;
}): Promise<string> {
  const { owner, repo } = parseRepository(args.repository);

  let data: GitHubIssueResponse[];
  try {
    data = await githubGet<GitHubIssueResponse[]>(
      `/repos/${owner}/${repo}/issues`,
      {
        since: args.since,
        state: 'open',
        sort: 'created',
        direction: 'asc',
        per_page: '100',
      }
    );
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      throw new GitHubApiError(
        `Repository '${owner}/${repo}' not found or is private. Note: this MCP server only has access to public repositories.`,
        404
      );
    }
    throw error;
  }

  const issues = data
    .filter((item) => !item.pull_request)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body,
      url: issue.html_url,
      author: issue.user?.login ?? null,
      labels: issue.labels.map((l) => l.name),
      created_at: issue.created_at,
    }));

  const result = {
    issues,
    totalCount: issues.length,
  };

  return JSON.stringify(result, null, 2);
}
