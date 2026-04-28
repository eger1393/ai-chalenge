import type { ReviewPublication, ReviewPublisher } from "../../application/ports.js";
import { formatReviewMarkdown } from "../presentation/review-markdown-formatter.js";
import { GitHubApiClient } from "./github-api-client.js";

export class GitHubReviewCommentPublisher implements ReviewPublisher {
  constructor(private readonly client: GitHubApiClient) {}

  async publish(input: ReviewPublication): Promise<void> {
    if (!input.context.prNumber) {
      return;
    }

    await this.client.postJson(`https://api.github.com/repos/${input.context.owner}/${input.context.name}/issues/${input.context.prNumber}/comments`, {
      body: formatReviewMarkdown(input)
    });
  }
}
