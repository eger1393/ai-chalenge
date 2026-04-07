import { githubGet, GitHubApiError } from '../github-api.js';
import { parseRepository } from '../utils/parse-repository.js';

interface BranchResponse {
  name: string;
  commit: {
    sha: string;
  };
}

export async function listBranches(args: { repository: string }): Promise<string> {
  const { owner, repo } = parseRepository(args.repository);

  let data: BranchResponse[];
  try {
    data = await githubGet<BranchResponse[]>(`/repos/${owner}/${repo}/branches`, {
      per_page: '100',
    });
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      throw new GitHubApiError(
        `Repository '${owner}/${repo}' not found or is private. Note: this MCP server only has access to public repositories.`,
        404
      );
    }
    throw error;
  }

  const results = data.map((branch) => ({
    name: branch.name,
    sha: branch.commit.sha,
  }));

  return JSON.stringify(results, null, 2);
}
