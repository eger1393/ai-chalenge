import { githubGet, GitHubApiError } from '../github-api.js';
import { parseRepository } from '../utils/parse-repository.js';

interface CommitResponse {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
}

export async function getCommits(args: {
  repository: string;
  branch?: string;
  limit?: number;
}): Promise<string> {
  const { owner, repo } = parseRepository(args.repository);

  const warnings: string[] = [];

  let clampedLimit = args.limit ?? 100;
  if (args.limit !== undefined) {
    if (args.limit < 1) {
      clampedLimit = 1;
      warnings.push(`Limit was clamped from ${args.limit} to 1 (minimum).`);
    } else if (args.limit > 100) {
      clampedLimit = 100;
      warnings.push(`Limit was clamped from ${args.limit} to 100 (maximum).`);
    }
  }

  const params: Record<string, string> = {
    per_page: clampedLimit.toString(),
  };

  if (args.branch) {
    params.sha = args.branch;
  }

  let data: CommitResponse[];
  try {
    data = await githubGet<CommitResponse[]>(`/repos/${owner}/${repo}/commits`, params);
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      const message = args.branch
        ? `Branch '${args.branch}' not found in repository '${owner}/${repo}'.`
        : `Repository '${owner}/${repo}' not found or is private. Note: this MCP server only has access to public repositories.`;
      throw new GitHubApiError(message, 404);
    }
    throw error;
  }

  const commits = data.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    date: c.commit.author.date,
    author: c.commit.author.name,
  }));

  const result: { commits: typeof commits; warnings?: string[] } = { commits };
  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  return JSON.stringify(result, null, 2);
}
