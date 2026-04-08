import { Injectable, Logger } from '@nestjs/common';
import { NotificationRepository } from './repositories/notification.repository';
import { NotificationGatewayService } from './notification-gateway.service';
import {
  IssueNotification,
  CreateNotificationData,
} from './interfaces/issue-notification.interface';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly gateway: NotificationGatewayService,
  ) {}

  async createAndPush(
    userId: string,
    data: CreateNotificationData,
  ): Promise<IssueNotification | null> {
    const notification = await this.notificationRepository.create(data);

    if (!notification) {
      this.logger.debug(
        `Duplicate notification skipped for user ${userId}, issue #${data.issueNumber}`,
      );
      return null;
    }

    this.gateway.push(userId, {
      type: 'new_notification',
      notification,
    });

    this.logger.log(
      `Notification created and pushed for user ${userId}, issue #${data.issueNumber}`,
    );

    return notification;
  }

  async getHistory(
    conversationId: string,
    limit: number,
    offset: number,
  ): Promise<IssueNotification[]> {
    return this.notificationRepository.findByConversationId(
      conversationId,
      limit,
      offset,
    );
  }

  async getUnreadCount(conversationId: string): Promise<number> {
    return this.notificationRepository.countUnreadByConversation(conversationId);
  }

  async markAsRead(id: string): Promise<IssueNotification | null> {
    return this.notificationRepository.markAsRead(id);
  }

  async markAllAsRead(conversationId: string): Promise<number> {
    return this.notificationRepository.markAllAsReadByConversation(
      conversationId,
    );
  }
}
