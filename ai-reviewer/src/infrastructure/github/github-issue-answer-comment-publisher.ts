import type { IssueAnswerPublication, IssueAnswerPublisher } from "../../application/ports.js";
import { formatIssueAnswerMarkdown } from "../presentation/issue-answer-markdown-formatter.js";
import { GitHubApiClient } from "./github-api-client.js";

export class GitHubIssueAnswerCommentPublisher implements IssueAnswerPublisher {
  constructor(private readonly client: GitHubApiClient) {}

  async publish(input: IssueAnswerPublication): Promise<void> {
    await this.client.postJson(`https://api.github.com/repos/${input.issue.owner}/${input.issue.name}/issues/${input.issue.issueNumber}/comments`, {
      body: formatIssueAnswerMarkdown(input)
    });
  }
}
