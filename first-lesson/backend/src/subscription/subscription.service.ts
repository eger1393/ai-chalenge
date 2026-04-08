import {
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { DatabaseService } from '../database/database.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { IssueSubscription } from './interfaces/issue-subscription.interface';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly subscriptionRepo: SubscriptionRepository,
    private readonly db: DatabaseService,
  ) {}

  async create(
    userId: string,
    dto: CreateSubscriptionDto,
  ): Promise<IssueSubscription> {
    // Verify conversation belongs to user
    const { rows } = await this.db.query(
      `SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
      [dto.conversationId, userId],
    );

    if (rows.length === 0) {
      throw new ForbiddenException(
        'Conversation not found or does not belong to user',
      );
    }

    // Check for duplicate active subscription
    const existing = await this.subscriptionRepo.findDuplicate(
      dto.conversationId,
      dto.repository,
    );

    if (existing) {
      this.logger.log(
        `Returning existing subscription ${existing.id} for ${dto.repository}`,
      );
      return existing;
    }

    const subscription = await this.subscriptionRepo.create({
      userId,
      conversationId: dto.conversationId,
      repository: dto.repository,
    });

    this.logger.log(
      `Created subscription ${subscription.id} for ${dto.repository} in conversation ${dto.conversationId}`,
    );

    return subscription;
  }

  async findByConversation(
    conversationId: string,
  ): Promise<IssueSubscription[]> {
    return this.subscriptionRepo.findActiveByConversation(conversationId);
  }

  async findByUser(userId: string): Promise<IssueSubscription[]> {
    return this.subscriptionRepo.findActiveByUserId(userId);
  }
}
