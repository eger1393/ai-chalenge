import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

interface AddMessageMetadata {
  model?: string;
  tokenCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
  durationMs?: number;
  currentMessageTokens?: number;
  historyTokens?: number;
  appliedModel?: string;
  appliedTemperature?: number;
  appliedMaxTokens?: number;
  contextUsedTokens?: number;
  contextMaxTokens?: number;
  truncatedMessages?: number;
  truncatedTokens?: number;
  branchId?: string;
}

@Injectable()
export class ConversationService {
  constructor(private readonly db: DatabaseService) {}

  async create(
    username: string,
    title?: string,
    model?: string,
    systemPrompt?: string,
    contextStrategy?: string,
    isTest?: boolean,
    testTopic?: string,
    testPairsTarget?: number,
    taskId?: string,
  ) {
    const id = crypto.randomUUID();
    const { rows } = await this.db.query(
      `INSERT INTO conversations (id, username, title, model, system_prompt, context_strategy, is_test, test_topic, test_pairs_target, task_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *, context_strategy AS "contextStrategy", is_test AS "isTest",
       task_id AS "taskId", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        id,
        username,
        title || 'New dialog',
        model || 'gpt-4o-mini',
        systemPrompt || null,
        contextStrategy || 'sliding_window',
        isTest || false,
        testTopic || null,
        testPairsTarget || 0,
        taskId || null,
      ],
    );
    return rows[0];
  }

  async findAll(username: string, limit = 10) {
    const { rows } = await this.db.query(
      `SELECT
         c.*,
         c.context_strategy AS "contextStrategy",
         c.is_test AS "isTest",
         c.test_topic AS "testTopic",
         c.active_branch_id AS "activeBranchId",
         c.created_at AS "createdAt",
         c.updated_at AS "updatedAt",
         c.system_prompt AS "systemPrompt",
         (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
         (SELECT COUNT(*)::int FROM messages WHERE conversation_id = c.id) AS message_count,
         c.task_id AS "taskId"
       FROM conversations c
       WHERE c.username = $1
       ORDER BY c.updated_at DESC
       LIMIT $2`,
      [username, limit],
    );
    return rows;
  }

  async findOne(username: string, id: string) {
    const { rows: convRows } = await this.db.query(
      `SELECT *, context_strategy AS "contextStrategy", is_test AS "isTest", test_topic AS "testTopic",
       active_branch_id AS "activeBranchId", task_id AS "taskId", created_at AS "createdAt", updated_at AS "updatedAt",
       system_prompt AS "systemPrompt"
       FROM conversations WHERE id = $1 AND username = $2`,
      [id, username],
    );

    if (convRows.length === 0) {
      throw new NotFoundException('Conversation not found');
    }

    const conversation = convRows[0];

    const { rows: messageRows } = await this.db.query(
      `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [id],
    );

    // Load debug data for all conversations
    const debugDataMap = await this.getDebugDataForConversation(id);

    const messages = messageRows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      model: m.model,
      tokenCount: m.token_count,
      promptTokens: m.prompt_tokens,
      completionTokens: m.completion_tokens,
      cost: m.cost,
      createdAt: m.created_at,
      durationMs: m.duration_ms || undefined,
      currentMessageTokens: m.current_message_tokens || undefined,
      historyTokens: m.history_tokens || undefined,
      appliedModel: m.applied_model || undefined,
      appliedTemperature: m.applied_temperature != null ? parseFloat(m.applied_temperature) : undefined,
      appliedMaxTokens: m.applied_max_tokens || undefined,
      contextUsedTokens: m.context_used_tokens || undefined,
      contextMaxTokens: m.context_max_tokens || undefined,
      truncatedMessages: m.truncated_messages || undefined,
      truncatedTokens: m.truncated_tokens || undefined,
      debugData: debugDataMap.has(m.id) ? debugDataMap.get(m.id) : undefined,
    }));

    const totals = await this.getConversationTotals(id);
    return { ...conversation, messages, conversationTotals: totals };
  }

  async update(username: string, id: string, data: { title?: string }) {
    const sets: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (data.title !== undefined) {
      sets.push(`title = $${paramIdx++}`);
      values.push(data.title);
    }

    sets.push(`updated_at = NOW()`);

    values.push(id, username);

    const { rows } = await this.db.query(
      `UPDATE conversations SET ${sets.join(', ')}
       WHERE id = $${paramIdx++} AND username = $${paramIdx}
       RETURNING *`,
      values,
    );

    if (rows.length === 0) {
      throw new NotFoundException('Conversation not found');
    }

    return rows[0];
  }

  async remove(username: string, id: string) {
    const { rowCount } = await this.db.query(
      'DELETE FROM conversations WHERE id = $1 AND username = $2',
      [id, username],
    );

    if (rowCount === 0) {
      throw new NotFoundException('Conversation not found');
    }
  }

  async addMessage(
    conversationId: string,
    role: string,
    content: string,
    metadata?: AddMessageMetadata,
  ) {
    const id = crypto.randomUUID();
    const { rows } = await this.db.query(
      `INSERT INTO messages (id, conversation_id, role, content, model, token_count, prompt_tokens, completion_tokens, cost, is_consilium, duration_ms, current_message_tokens, history_tokens, applied_model, applied_temperature, applied_max_tokens, context_used_tokens, context_max_tokens, truncated_messages, truncated_tokens, branch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
       RETURNING *`,
      [
        id,
        conversationId,
        role,
        content,
        metadata?.model || null,
        metadata?.tokenCount || 0,
        metadata?.promptTokens || 0,
        metadata?.completionTokens || 0,
        metadata?.cost || 0,
        false,
        metadata?.durationMs || 0,
        metadata?.currentMessageTokens || 0,
        metadata?.historyTokens || 0,
        metadata?.appliedModel || null,
        metadata?.appliedTemperature ?? null,
        metadata?.appliedMaxTokens || null,
        metadata?.contextUsedTokens || 0,
        metadata?.contextMaxTokens || 0,
        metadata?.truncatedMessages || 0,
        metadata?.truncatedTokens || 0,
        metadata?.branchId || null,
      ],
    );

    // Update conversation's updated_at
    await this.db.query(
      'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
      [conversationId],
    );

    return rows[0];
  }

  async setTaskId(conversationId: string, taskId: string | null): Promise<void> {
    await this.db.query(
      'UPDATE conversations SET task_id = $1, updated_at = NOW() WHERE id = $2',
      [taskId, conversationId],
    );
  }

  async getMessagesForContext(conversationId: string): Promise<Array<{ role: string; content: string }>> {
    const { rows } = await this.db.query(
      'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId],
    );
    return rows;
  }

  async updateTitle(conversationId: string, title: string) {
    await this.db.query(
      'UPDATE conversations SET title = $1 WHERE id = $2',
      [title, conversationId],
    );
  }

  async getConversation(id: string) {
    const { rows } = await this.db.query(
      `SELECT *, context_strategy AS "contextStrategy", is_test AS "isTest",
       active_branch_id AS "activeBranchId", task_id AS "taskId"
       FROM conversations WHERE id = $1`,
      [id],
    );
    return rows[0] || null;
  }

  async getMessageCount(conversationId: string): Promise<number> {
    const { rows } = await this.db.query(
      'SELECT COUNT(*)::int AS count FROM messages WHERE conversation_id = $1',
      [conversationId],
    );
    return rows[0].count;
  }

  async getSummary(conversationId: string): Promise<{ summary: string | null; summaryUpToIndex: number }> {
    const { rows } = await this.db.query(
      'SELECT summary, summary_up_to_index FROM conversations WHERE id = $1',
      [conversationId],
    );
    if (rows.length === 0) return { summary: null, summaryUpToIndex: 0 };
    return { summary: rows[0].summary, summaryUpToIndex: rows[0].summary_up_to_index || 0 };
  }

  async updateSummary(conversationId: string, summary: string, upToIndex: number): Promise<void> {
    await this.db.query(
      'UPDATE conversations SET summary = $1, summary_up_to_index = $2 WHERE id = $3',
      [summary, upToIndex, conversationId],
    );
  }

  async getAllMessages(conversationId: string): Promise<Array<{ role: string; content: string }>> {
    const { rows } = await this.db.query(
      'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId],
    );
    return rows;
  }

  async saveDebugData(messageId: string, data: Record<string, unknown>): Promise<void> {
    await this.db.query(
      `INSERT INTO message_debug_data (
        message_id, strategy_type, context_messages_count, context_messages_after_truncation,
        facts_snapshot, branch_info, summary_info, token_breakdown, strategy_metadata, memory_layers
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (message_id) DO UPDATE SET
        strategy_type = EXCLUDED.strategy_type,
        context_messages_count = EXCLUDED.context_messages_count,
        context_messages_after_truncation = EXCLUDED.context_messages_after_truncation,
        facts_snapshot = EXCLUDED.facts_snapshot,
        branch_info = EXCLUDED.branch_info,
        summary_info = EXCLUDED.summary_info,
        token_breakdown = EXCLUDED.token_breakdown,
        strategy_metadata = EXCLUDED.strategy_metadata,
        memory_layers = EXCLUDED.memory_layers`,
      [
        messageId,
        data.strategyType ?? null,
        data.contextMessagesCount ?? 0,
        data.contextMessagesAfterTruncation ?? 0,
        data.factsSnapshot ? JSON.stringify(data.factsSnapshot) : null,
        data.branchInfo ? JSON.stringify(data.branchInfo) : null,
        data.summaryInfo ? JSON.stringify(data.summaryInfo) : null,
        data.tokenBreakdown ? JSON.stringify(data.tokenBreakdown) : null,
        data.strategyMetadata ? JSON.stringify(data.strategyMetadata) : null,
        data.memoryLayers ? JSON.stringify(data.memoryLayers) : null,
      ],
    );
  }

  async getDebugDataForConversation(conversationId: string): Promise<Map<string, Record<string, unknown>>> {
    const { rows } = await this.db.query(
      `SELECT mdd.* FROM message_debug_data mdd
       JOIN messages m ON mdd.message_id = m.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [conversationId],
    );

    const map = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      map.set(row.message_id, {
        id: row.id,
        strategyType: row.strategy_type,
        contextMessagesCount: row.context_messages_count,
        contextMessagesAfterTruncation: row.context_messages_after_truncation,
        factsSnapshot: row.facts_snapshot,
        branchInfo: row.branch_info,
        summaryInfo: row.summary_info,
        tokenBreakdown: row.token_breakdown,
        strategyMetadata: row.strategy_metadata,
        memoryLayers: row.memory_layers,
        createdAt: row.created_at,
      });
    }
    return map;
  }

  async updateStrategy(conversationId: string, strategy: string): Promise<void> {
    await this.db.query(
      'UPDATE conversations SET context_strategy = $1 WHERE id = $2',
      [strategy, conversationId],
    );
  }

  async getConversationTotals(conversationId: string) {
    const { rows } = await this.db.query(
      `SELECT
         COUNT(*)::int AS total_messages,
         COALESCE(SUM(token_count), 0)::int AS total_tokens,
         COALESCE(SUM(prompt_tokens), 0)::int AS total_prompt_tokens,
         COALESCE(SUM(completion_tokens), 0)::int AS total_completion_tokens,
         COALESCE(SUM(cost), 0)::float AS total_cost
       FROM messages
       WHERE conversation_id = $1`,
      [conversationId],
    );
    return {
      totalMessages: rows[0].total_messages,
      totalTokens: rows[0].total_tokens,
      totalPromptTokens: rows[0].total_prompt_tokens,
      totalCompletionTokens: rows[0].total_completion_tokens,
      totalCost: rows[0].total_cost,
    };
  }
}
