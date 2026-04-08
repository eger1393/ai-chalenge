import { Injectable, Logger } from '@nestjs/common';
import { McpToolRouter } from '../mcp/mcp-tool-router.service';
import { IssueSubscription } from './interfaces/issue-subscription.interface';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(private readonly mcpToolRouter: McpToolRouter) {}

  async create(
    userId: string,
    dto: { repository: string; conversationId: string },
  ): Promise<IssueSubscription> {
    const result = await this.mcpToolRouter.executeTool(
      'github-explorer__subscribe_to_issues',
      {
        repository: dto.repository,
        conversation_id: dto.conversationId,
        user_id: userId,
        ttl_minutes: 1440,
      },
    );

    this.logger.log(
      `Created MCP subscription for ${dto.repository} in conversation ${dto.conversationId}`,
    );

    const parsed = JSON.parse(result) as IssueSubscription;
    return parsed;
  }

  async findByConversation(
    conversationId: string,
  ): Promise<IssueSubscription[]> {
    const result = await this.mcpToolRouter.executeTool(
      'github-explorer__list_subscriptions',
      { conversation_id: conversationId },
    );

    const parsed = JSON.parse(result) as IssueSubscription[];
    return parsed;
  }

  async findByUser(_userId: string): Promise<IssueSubscription[]> {
    // MCP doesn't support user-level queries;
    // frontend always passes conversationId anyway
    return [];
  }
}
