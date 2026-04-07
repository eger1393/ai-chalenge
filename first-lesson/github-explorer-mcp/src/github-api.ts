const BASE_URL = 'https://api.github.com';

export class GitHubApiError extends Error {
  public readonly status: number;
  public readonly retryAfter?: string;

  constructor(message: string, status: number, retryAfter?: string) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export async function githubGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE_URL);

  if (params) {
    const searchParams = new URLSearchParams(params);
    url.search = searchParams.toString();
  }

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'github-explorer-mcp/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url.toString(), { headers });

  if (response.status === 403 || response.status === 429) {
    const resetHeader = response.headers.get('X-RateLimit-Reset');
    let resetTime = '';
    if (resetHeader) {
      const resetDate = new Date(parseInt(resetHeader, 10) * 1000);
      const hours = resetDate.getUTCHours().toString().padStart(2, '0');
      const minutes = resetDate.getUTCMinutes().toString().padStart(2, '0');
      resetTime = `${hours}:${minutes}`;
    }

    throw new GitHubApiError(
      `GitHub API rate limit exceeded. Limit resets at ${resetTime} UTC. Anonymous access allows 60 requests/hour.`,
      response.status,
      resetHeader ?? undefined
    );
  }

  if (response.status === 404) {
    throw new GitHubApiError(`Not found: ${path}`, 404);
  }

  if (response.status >= 400) {
    const body = await response.text();
    throw new GitHubApiError(`GitHub API error (${response.status}): ${body}`, response.status);
  }

  return (await response.json()) as T;
}
