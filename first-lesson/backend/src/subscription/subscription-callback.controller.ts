import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { resolveStoredAISelection } from '../ai/dto/ai-params.dto';
import { OpenAIService } from '../ai/openai.service';
import { ConversationService } from '../conversation/conversation.service';
import { NotificationService } from '../notification/notification.service';
import {
  SubscriptionCallbackDto,
  CallbackIssueDto,
} from './dto/subscription-callback.dto';

@Controller('internal')
export class SubscriptionCallbackController {
  private readonly logger = new Logger(SubscriptionCallbackController.name);

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly conversationService: ConversationService,
    private readonly notificationService: NotificationService,
  ) {}

  @Post('subscription-callback')
  async handleCallback(
    @Headers('x-mcp-secret') mcpSecret: string | undefined,
    @Body() dto: SubscriptionCallbackDto,
  ): Promise<{ received: true; notifications_created: number }> {
    const expectedSecret = process.env.MCP_CALLBACK_SECRET;
    if (!expectedSecret || mcpSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid or missing X-MCP-Secret header');
    }

    this.logger.log(
      `Callback received: ${dto.issues.length} issue(s) from ${dto.repository} (subscription=${dto.subscription_id})`,
    );

    let notificationsCreated = 0;

    for (const issue of dto.issues) {
      try {
        const summary = await this.generateIssueSummary(
          dto.user_id,
          dto.conversation_id,
          issue,
        );

        const created = await this.notificationService.createAndPush(dto.user_id, {
          subscriptionId: dto.subscription_id,
          conversationId: dto.conversation_id,
          issueNumber: issue.number,
          issueTitle: issue.title,
          issueUrl: issue.url,
          issueAuthor: issue.author,
          summary,
        });

        if (created) notificationsCreated++;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to process issue #${issue.number} from ${dto.repository}: ${message}`,
        );
      }
    }

    this.logger.log(
      `Callback processed: ${notificationsCreated}/${dto.issues.length} notifications created`,
    );

    return { received: true, notifications_created: notificationsCreated };
  }

  private async generateIssueSummary(
    userId: string,
    conversationId: string,
    issue: CallbackIssueDto,
  ): Promise<string> {
    const userContent = `Issue #${issue.number}: ${issue.title}\n\n${issue.body || 'No description'}`;
    const conversation = await this.conversationService.findOne(userId, conversationId);
    const selection = resolveStoredAISelection({
      provider: conversation.provider,
      model: conversation.model,
    });

    const completion = await this.openaiService.callOpenAI(
      selection.model,
      [
        {
          role: 'system',
          content:
            'Summarize this GitHub issue in 2-3 sentences in Russian.',
        },
        { role: 'user', content: userContent },
      ],
      0.3,
      300,
      undefined,
      selection.provider,
    );

    return completion.choices[0]?.message?.content ?? '';
  }
}
