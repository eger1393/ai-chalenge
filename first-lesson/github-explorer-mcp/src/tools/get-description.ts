import { githubGet, GitHubApiError } from '../github-api.js';
import { parseRepository } from '../utils/parse-repository.js';

interface RepoResponse {
  name: string;
  full_name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  html_url: string;
}

export async function getDescription(args: { repository: string }): Promise<string> {
  const { owner, repo } = parseRepository(args.repository);

  let data: RepoResponse;
  try {
    data = await githubGet<RepoResponse>(`/repos/${owner}/${repo}`);
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      throw new GitHubApiError(
        `Repository '${owner}/${repo}' not found or is private. Note: this MCP server only has access to public repositories.`,
        404
      );
    }
    throw error;
  }

  const result = {
    name: data.name,
    full_name: data.full_name,
    description: data.description,
    stars: data.stargazers_count,
    language: data.language,
    url: data.html_url,
  };

  return JSON.stringify(result, null, 2);
}
