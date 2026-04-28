export class GitHubApiClient {
  constructor(private readonly token: string) {}

  async getJson<T>(url: string): Promise<T> {
    const response = await this.fetch(url);
    return response.json() as Promise<T>;
  }

  async postJson(url: string, body: unknown): Promise<void> {
    await this.fetch(url, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  private async fetch(url: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init?.headers
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}: ${text}`);
    }

    return response;
  }
}
