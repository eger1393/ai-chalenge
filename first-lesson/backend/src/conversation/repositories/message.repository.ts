import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../database/base.repository';
import { DatabaseService } from '../../database/database.service';

export interface Message {
  id: string;
  conversationId: string;
  branchId: string | null;
  userContent: string;
  assistantContent: string | null;
  status: string;
  currentStep: string | null;
  attemptNumber: number;
  maxAttempts: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageMetaData {
  appliedModel?: string;
  appliedTemperature?: number;
  appliedMaxTokens?: number;
  appliedRepetitionPenalty?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  durationMs?: number;
  contextUsedTokens?: number;
  contextMaxTokens?: number;
  truncatedMessages?: number;
  truncatedTokens?: number;
}

export interface MessageDebugData {
  strategyType?: string;
  contextMessagesCount?: number;
  contextMessagesAfterTruncation?: number;
  tokenBreakdown?: unknown;
  factsSnapshot?: unknown;
  branchInfo?: unknown;
  summaryInfo?: unknown;
  strategyMetadata?: unknown;
  memoryLayers?: unknown;
}

export interface MessageDebug {
  id: string;
  messageId: string;
  strategyType: string | null;
  contextMessagesCount: number;
  contextMessagesAfterTruncation: number;
  tokenBreakdown: unknown;
  factsSnapshot: unknown;
  branchInfo: unknown;
  summaryInfo: unknown;
  strategyMetadata: unknown;
  memoryLayers: unknown;
  createdAt: Date;
}

function mapRow(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    branchId: (row.branch_id as string) ?? null,
    userContent: row.user_content as string,
    assistantContent: (row.assistant_content as string) ?? null,
    status: row.status as string,
    currentStep: (row.current_step as string) ?? null,
    attemptNumber: (row.attempt_number as number) ?? 0,
    maxAttempts: (row.max_attempts as number) ?? 3,
    errorMessage: (row.error_message as string) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

function mapDebugRow(row: Record<string, unknown>): MessageDebug {
  return {
    id: row.id as string,
    messageId: row.message_id as string,
    strategyType: (row.strategy_type as string) ?? null,
    contextMessagesCount: (row.context_messages_count as number) ?? 0,
    contextMessagesAfterTruncation: (row.context_messages_after_truncation as number) ?? 0,
    tokenBreakdown: row.token_breakdown ?? null,
    factsSnapshot: row.facts_snapshot ?? null,
    branchInfo: row.branch_info ?? null,
    summaryInfo: row.summary_info ?? null,
    strategyMetadata: row.strategy_metadata ?? null,
    memoryLayers: row.memory_layers ?? null,
    createdAt: row.created_at as Date,
  };
}

@Injectable()
export class MessageRepository extends BaseRepository<Message> {
  constructor(db: DatabaseService) {
    super(db, 'messages');
  }

  async findById(id: string): Promise<Message | null> {
    const { rows } = await this.db.query(
      `SELECT * FROM messages WHERE id = $1`,
      [id],
    );
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }

  async createEnvelope(
    conversationId: string,
    userContent: string,
    branchId?: string,
  ): Promise<Message> {
    const id = crypto.randomUUID();
    const { rows } = await this.db.query(
      `INSERT INTO messages (id, conversation_id, branch_id, user_content, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [id, conversationId, branchId || null, userContent],
    );
    return mapRow(rows[0]);
  }

  async updateStatus(
    id: string,
    status: string,
    currentStep?: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE messages
       SET status = $1, current_step = $2, error_message = $3, updated_at = NOW()
       WHERE id = $4`,
      [status, currentStep || null, errorMessage || null, id],
    );
  }

  async updateAssistantContent(id: string, content: string): Promise<void> {
    await this.db.query(
      `UPDATE messages SET assistant_content = $1, updated_at = NOW() WHERE id = $2`,
      [content, id],
    );
  }

  async incrementAttempt(id: string): Promise<void> {
    await this.db.query(
      `UPDATE messages SET attempt_number = attempt_number + 1, updated_at = NOW() WHERE id = $1`,
      [id],
    );
  }

  async findByConversationId(conversationId: string): Promise<Message[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId],
    );
    return rows.map(mapRow);
  }

  async getForContext(
    conversationId: string,
    branchId?: string,
  ): Promise<Array<{ role: string; content: string }>> {
    let sql = `SELECT user_content, assistant_content FROM messages
               WHERE conversation_id = $1 AND status = 'done'`;
    const params: unknown[] = [conversationId];

    if (branchId) {
      sql += ` AND branch_id = $2`;
      params.push(branchId);
    }

    sql += ` ORDER BY created_at ASC`;

    const { rows } = await this.db.query(sql, params);

    const result: Array<{ role: string; content: string }> = [];
    for (const row of rows) {
      result.push({ role: 'user', content: row.user_content });
      if (row.assistant_content) {
        result.push({ role: 'assistant', content: row.assistant_content });
      }
    }
    return result;
  }

  async saveMeta(messageId: string, meta: MessageMetaData): Promise<void> {
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO message_meta (
        id, message_id, applied_model, applied_temperature, applied_max_tokens,
        applied_repetition_penalty, prompt_tokens, completion_tokens, total_tokens,
        cost, duration_ms, context_used_tokens, context_max_tokens,
        truncated_messages, truncated_tokens
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id,
        messageId,
        meta.appliedModel ?? null,
        meta.appliedTemperature ?? null,
        meta.appliedMaxTokens ?? null,
        meta.appliedRepetitionPenalty ?? null,
        meta.promptTokens ?? null,
        meta.completionTokens ?? null,
        meta.totalTokens ?? null,
        meta.cost ?? null,
        meta.durationMs ?? null,
        meta.contextUsedTokens ?? null,
        meta.contextMaxTokens ?? null,
        meta.truncatedMessages ?? null,
        meta.truncatedTokens ?? null,
      ],
    );
  }

  async saveDebug(messageId: string, debug: MessageDebugData): Promise<void> {
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO message_debug (
        id, message_id, strategy_type, context_messages_count,
        context_messages_after_truncation, token_breakdown, facts_snapshot,
        branch_info, summary_info, strategy_metadata, memory_layers
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (message_id) DO UPDATE SET
        strategy_type = EXCLUDED.strategy_type,
        context_messages_count = EXCLUDED.context_messages_count,
        context_messages_after_truncation = EXCLUDED.context_messages_after_truncation,
        token_breakdown = EXCLUDED.token_breakdown,
        facts_snapshot = EXCLUDED.facts_snapshot,
        branch_info = EXCLUDED.branch_info,
        summary_info = EXCLUDED.summary_info,
        strategy_metadata = EXCLUDED.strategy_metadata,
        memory_layers = EXCLUDED.memory_layers`,
      [
        id,
        messageId,
        debug.strategyType ?? null,
        debug.contextMessagesCount ?? 0,
        debug.contextMessagesAfterTruncation ?? 0,
        debug.tokenBreakdown ? JSON.stringify(debug.tokenBreakdown) : null,
        debug.factsSnapshot ? JSON.stringify(debug.factsSnapshot) : null,
        debug.branchInfo ? JSON.stringify(debug.branchInfo) : null,
        debug.summaryInfo ? JSON.stringify(debug.summaryInfo) : null,
        debug.strategyMetadata ? JSON.stringify(debug.strategyMetadata) : null,
        debug.memoryLayers ? JSON.stringify(debug.memoryLayers) : null,
      ],
    );
  }

  async getDebugByMessageId(messageId: string): Promise<MessageDebug | null> {
    const { rows } = await this.db.query(
      `SELECT * FROM message_debug WHERE message_id = $1`,
      [messageId],
    );
    return rows.length > 0 ? mapDebugRow(rows[0]) : null;
  }

  async getTotals(
    conversationId: string,
  ): Promise<{ totalTokens: number; totalCost: number }> {
    const { rows } = await this.db.query(
      `SELECT
         COALESCE(SUM(mm.total_tokens), 0)::int AS total_tokens,
         COALESCE(SUM(mm.cost), 0)::float AS total_cost
       FROM message_meta mm
       JOIN messages m ON mm.message_id = m.id
       WHERE m.conversation_id = $1`,
      [conversationId],
    );
    return {
      totalTokens: rows[0].total_tokens,
      totalCost: rows[0].total_cost,
    };
  }

  async getMessageCount(conversationId: string): Promise<number> {
    const { rows } = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM messages WHERE conversation_id = $1`,
      [conversationId],
    );
    return rows[0].count;
  }

  async findPendingOrProcessing(conversationId: string): Promise<Message | null> {
    const { rows } = await this.db.query(
      `SELECT * FROM messages
       WHERE conversation_id = $1 AND status IN ('pending', 'processing')
       ORDER BY created_at DESC
       LIMIT 1`,
      [conversationId],
    );
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }
}
