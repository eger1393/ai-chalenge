import type { DiffProvider } from "../../application/ports.js";
import type { ReviewContext } from "../../domain/review-context.js";
import { GitHubApiClient } from "./github-api-client.js";

interface PullFile {
  filename: string;
  status: string;
  patch?: string;
}

export class GitHubPullRequestDiffProvider implements DiffProvider {
  constructor(private readonly client?: GitHubApiClient) {}

  async getDiff(context: ReviewContext): Promise<string | undefined> {
    if (!this.client || !context.prNumber) {
      return undefined;
    }

    const files: PullFile[] = [];

    for (let page = 1; page <= 10; page += 1) {
      const pageFiles = await this.client.getJson<PullFile[]>(`https://api.github.com/repos/${context.owner}/${context.name}/pulls/${context.prNumber}/files?per_page=100&page=${page}`);
      files.push(...pageFiles);

      if (pageFiles.length < 100) {
        break;
      }
    }

    return files.map((file) => {
      const patch = file.patch ?? `File ${file.filename} has no textual patch available. Status: ${file.status}.`;
      return `diff --git a/${file.filename} b/${file.filename}\n${patch}`;
    }).join("\n\n");
  }
}
