import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { McpToolRouter } from '../mcp/mcp-tool-router.service';
import { OpenAIService } from '../ai/openai.service';
import { NotificationService } from '../notification/notification.service';
import { IssueSubscription } from './interfaces/issue-subscription.interface';

interface ParsedIssue {
  number: number;
  title: string;
  url: string;
  author: string;
  body?: string;
}

@Injectable()
export class SubscriptionPollerService {
  private readonly logger = new Logger(SubscriptionPollerService.name);
  private isPolling = false;

  constructor(
    private readonly subscriptionRepo: SubscriptionRepository,
    private readonly mcpToolRouter: McpToolRouter,
    private readonly openaiService: OpenAIService,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron('*/5 * * * *')
  async pollSubscriptions(): Promise<void> {
    if (this.isPolling) {
      this.logger.warn('Previous polling cycle still running, skipping');
      return;
    }

    this.isPolling = true;
    try {
      // 1. Deactivate expired subscriptions
      const deactivated = await this.subscriptionRepo.deactivateExpired();
      if (deactivated > 0) {
        this.logger.log(
          `Deactivated ${deactivated} expired subscriptions`,
        );
      }

      // 2. Fetch active subscriptions
      const subs = await this.subscriptionRepo.findAllActive();
      this.logger.log(`Polling ${subs.length} active subscriptions`);

      // 3. Poll each subscription independently
      for (const sub of subs) {
        try {
          await this.pollSubscription(sub);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Error polling ${sub.repository}: ${message}`,
          );
        }
      }
    } finally {
      this.isPolling = false;
    }
  }

  private async pollSubscription(sub: IssueSubscription): Promise<void> {
    // Call MCP tool to check new issues
    const result = await this.mcpToolRouter.executeTool(
      'github-explorer__check_new_issues',
      {
        repository: sub.repository,
        since: sub.lastCheckedAt.toISOString(),
      },
    );

    // Parse result from MCP tool
    const parsed: { issues: ParsedIssue[]; totalCount: number } =
      JSON.parse(result);

    const newIssues = parsed.issues.filter(
      (i) => i.number > sub.lastIssueNumber,
    );

    if (newIssues.length === 0) {
      // Update last_checked_at even when no new issues found
      await this.subscriptionRepo.updateLastChecked(
        sub.id,
        new Date(),
        sub.lastIssueNumber,
      );
      return;
    }

    // Generate LLM summary for the batch
    const summary = await this.generateSummary(sub.repository, newIssues);

    // Create notifications for each issue
    for (const issue of newIssues) {
      await this.notificationService.createAndPush(sub.userId, {
        subscriptionId: sub.id,
        conversationId: sub.conversationId,
        issueNumber: issue.number,
        issueTitle: issue.title,
        issueUrl: issue.url,
        issueAuthor: issue.author,
        summary,
      });
    }

    // Update watermark
    const maxIssueNumber = Math.max(...newIssues.map((i) => i.number));
    await this.subscriptionRepo.updateLastChecked(
      sub.id,
      new Date(),
      maxIssueNumber,
    );

    this.logger.log(
      `Found ${newIssues.length} new issues in ${sub.repository}`,
    );
  }

  private async generateSummary(
    repository: string,
    issues: ParsedIssue[],
  ): Promise<string> {
    const issuesList = issues
      .map(
        (i) =>
          `- #${i.number}: ${i.title}\n  ${i.body?.substring(0, 200) || 'No description'}`,
      )
      .join('\n');

    const prompt = `Summarize the following new GitHub issues from ${repository} in a concise Markdown format. For each issue provide a 1-sentence summary with a clickable link. Write in the language of the issue titles.\n\nIssues:\n${issuesList}`;

    const completion = await this.openaiService.callOpenAI(
      'gpt-4o-mini',
      [{ role: 'user', content: prompt }],
      0.3,
      500,
    );

    return completion.choices[0]?.message?.content ?? '';
  }
}
