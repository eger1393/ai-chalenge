import { appendFile } from "node:fs/promises";
import type { IssueAnswerPublication, IssueAnswerPublisher } from "../../application/ports.js";
import { formatIssueAnswerMarkdown } from "../presentation/issue-answer-markdown-formatter.js";

export class GitHubIssueAnswerStepSummaryPublisher implements IssueAnswerPublisher {
  constructor(private readonly summaryPath?: string) {}

  async publish(input: IssueAnswerPublication): Promise<void> {
    if (!this.summaryPath) {
      return;
    }

    await appendFile(this.summaryPath, `${formatIssueAnswerMarkdown(input)}\n`, "utf8");
  }
}
