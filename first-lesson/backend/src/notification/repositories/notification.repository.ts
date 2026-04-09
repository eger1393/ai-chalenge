import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../database/base.repository';
import { DatabaseService } from '../../database/database.service';
import {
  IssueNotification,
  CreateNotificationData,
} from '../interfaces/issue-notification.interface';

function mapRow(row: Record<string, unknown>): IssueNotification {
  return {
    id: row.id as string,
    subscriptionId: row.subscription_id as string,
    conversationId: row.conversation_id as string,
    issueNumber: row.issue_number as number,
    issueTitle: row.issue_title as string,
    issueUrl: row.issue_url as string,
    issueAuthor: (row.issue_author as string) ?? null,
    summary: (row.summary as string) ?? null,
    isRead: row.is_read as boolean,
    createdAt: row.created_at as Date,
  };
}

@Injectable()
export class NotificationRepository extends BaseRepository<IssueNotification> {
  constructor(db: DatabaseService) {
    super(db, 'issue_notifications');
  }

  async create(data: CreateNotificationData): Promise<IssueNotification | null> {
    const { rows } = await this.db.query(
      `INSERT INTO issue_notifications
        (subscription_id, conversation_id, issue_number, issue_title, issue_url, issue_author, summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (conversation_id, issue_number) DO NOTHING
       RETURNING *`,
      [
        data.subscriptionId,
        data.conversationId,
        data.issueNumber,
        data.issueTitle,
        data.issueUrl,
        data.issueAuthor ?? null,
        data.summary ?? null,
      ],
    );
    if (rows.length === 0) return null;
    return mapRow(rows[0]);
  }

  async findByConversationId(
    conversationId: string,
    limit: number,
    offset: number,
  ): Promise<IssueNotification[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM issue_notifications
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset],
    );
    return rows.map(mapRow);
  }

  async countUnreadByConversation(conversationId: string): Promise<number> {
    const { rows } = await this.db.query(
      `SELECT COUNT(*)::int AS count
       FROM issue_notifications
       WHERE conversation_id = $1 AND is_read = false`,
      [conversationId],
    );
    return rows[0].count;
  }

  async markAsRead(id: string): Promise<IssueNotification | null> {
    const { rows } = await this.db.query(
      `UPDATE issue_notifications
       SET is_read = true
       WHERE id = $1
       RETURNING *`,
      [id],
    );
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }

  async markAllAsReadByConversation(conversationId: string): Promise<number> {
    const result = await this.db.query(
      `UPDATE issue_notifications
       SET is_read = true
       WHERE conversation_id = $1 AND is_read = false`,
      [conversationId],
    );
    return result.rowCount ?? 0;
  }
}
