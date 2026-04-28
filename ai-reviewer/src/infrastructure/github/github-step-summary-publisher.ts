import { appendFile } from "node:fs/promises";
import type { ReviewPublication, ReviewPublisher } from "../../application/ports.js";
import { formatReviewMarkdown } from "../presentation/review-markdown-formatter.js";

export class GitHubStepSummaryPublisher implements ReviewPublisher {
  constructor(private readonly summaryPath?: string) {}

  async publish(input: ReviewPublication): Promise<void> {
    if (!this.summaryPath) {
      return;
    }

    await appendFile(this.summaryPath, `${formatReviewMarkdown(input)}\n`, "utf8");
  }
}
