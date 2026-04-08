import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../database/base.repository';
import { DatabaseService } from '../../database/database.service';
import { IssueSubscription } from '../interfaces/issue-subscription.interface';

function mapRow(row: Record<string, unknown>): IssueSubscription {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    userId: row.user_id as string,
    repository: row.repository as string,
    lastCheckedAt: row.last_checked_at as Date,
    lastIssueNumber: row.last_issue_number as number,
    expiresAt: row.expires_at as Date,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as Date,
  };
}

@Injectable()
export class SubscriptionRepository extends BaseRepository<IssueSubscription> {
  constructor(db: DatabaseService) {
    super(db, 'issue_subscriptions');
  }

  async create(data: {
    userId: string;
    conversationId: string;
    repository: string;
  }): Promise<IssueSubscription> {
    const { rows } = await this.db.query(
      `INSERT INTO issue_subscriptions (user_id, conversation_id, repository, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')
       RETURNING *`,
      [data.userId, data.conversationId, data.repository],
    );
    return mapRow(rows[0]);
  }

  async findActiveByConversation(
    conversationId: string,
  ): Promise<IssueSubscription[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM issue_subscriptions
       WHERE conversation_id = $1
         AND is_active = true
         AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [conversationId],
    );
    return rows.map(mapRow);
  }

  async findAllActive(): Promise<IssueSubscription[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM issue_subscriptions
       WHERE is_active = true
         AND expires_at > NOW()
       ORDER BY last_checked_at ASC`,
    );
    return rows.map(mapRow);
  }

  async findActiveByUserId(userId: string): Promise<IssueSubscription[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM issue_subscriptions
       WHERE user_id = $1
         AND is_active = true
         AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map(mapRow);
  }

  async findDuplicate(
    conversationId: string,
    repository: string,
  ): Promise<IssueSubscription | null> {
    const { rows } = await this.db.query(
      `SELECT * FROM issue_subscriptions
       WHERE conversation_id = $1
         AND repository = $2
         AND is_active = true`,
      [conversationId, repository],
    );
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }

  async updateLastChecked(
    id: string,
    lastCheckedAt: Date,
    lastIssueNumber: number,
  ): Promise<void> {
    await this.db.query(
      `UPDATE issue_subscriptions
       SET last_checked_at = $2, last_issue_number = $3
       WHERE id = $1`,
      [id, lastCheckedAt, lastIssueNumber],
    );
  }

  async deactivateExpired(): Promise<number> {
    const result = await this.db.query(
      `UPDATE issue_subscriptions
       SET is_active = false
       WHERE expires_at <= NOW()
         AND is_active = true`,
    );
    return result.rowCount ?? 0;
  }
}
