import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../database/base.repository';
import { DatabaseService } from '../../database/database.service';

export interface ConversationContext {
  id: string;
  conversation_id: string;
  strategy_type: string;
  strategy_data: Record<string, unknown>;
  summary: string | null;
  summary_up_to_index: number;
  active_branch_id: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ContextRepository extends BaseRepository<ConversationContext> {
  constructor(db: DatabaseService) {
    super(db, 'conversation_contexts');
  }

  async findByConversationId(conversationId: string): Promise<ConversationContext | null> {
    const { rows } = await this.db.query<ConversationContext>(
      `SELECT * FROM conversation_contexts WHERE conversation_id = $1`,
      [conversationId],
    );
    return rows[0] || null;
  }

  async create(
    conversationId: string,
    strategyType: string,
    strategyData?: Record<string, unknown>,
  ): Promise<ConversationContext> {
    const { rows } = await this.db.query<ConversationContext>(
      `INSERT INTO conversation_contexts (id, conversation_id, strategy_type, strategy_data)
       VALUES (gen_random_uuid(), $1, $2, $3)
       RETURNING *`,
      [conversationId, strategyType, JSON.stringify(strategyData || {})],
    );
    return rows[0];
  }

  async updateStrategyType(
    conversationId: string,
    strategyType: string,
    strategyData?: Record<string, unknown>,
  ): Promise<void> {
    await this.db.query(
      `UPDATE conversation_contexts
       SET strategy_type = $1, strategy_data = $2, updated_at = NOW()
       WHERE conversation_id = $3`,
      [strategyType, JSON.stringify(strategyData || {}), conversationId],
    );
  }

  async updateStrategyData(
    conversationId: string,
    strategyData: Record<string, unknown>,
  ): Promise<void> {
    await this.db.query(
      `UPDATE conversation_contexts
       SET strategy_data = $1, updated_at = NOW()
       WHERE conversation_id = $2`,
      [JSON.stringify(strategyData), conversationId],
    );
  }

  async updateSummary(
    conversationId: string,
    summary: string,
    upToIndex: number,
  ): Promise<void> {
    await this.db.query(
      `UPDATE conversation_contexts
       SET summary = $1, summary_up_to_index = $2, updated_at = NOW()
       WHERE conversation_id = $3`,
      [summary, upToIndex, conversationId],
    );
  }

  async setActiveBranch(
    conversationId: string,
    branchId: string | null,
  ): Promise<void> {
    await this.db.query(
      `UPDATE conversation_contexts
       SET active_branch_id = $1, updated_at = NOW()
       WHERE conversation_id = $2`,
      [branchId, conversationId],
    );
  }
}
