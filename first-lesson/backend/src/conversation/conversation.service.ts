import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

interface AddMessageMetadata {
  model?: string;
  tokenCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
  isConsilium?: boolean;
}

interface ExpertOpinionInput {
  expertName: string;
  content: string;
  isError?: boolean;
}

@Injectable()
export class ConversationService {
  constructor(private readonly db: DatabaseService) {}

  async create(
    username: string,
    title?: string,
    model?: string,
    systemPrompt?: string,
  ) {
    const id = crypto.randomUUID();
    const { rows } = await this.db.query(
      `INSERT INTO conversations (id, username, title, model, system_prompt)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        id,
        username,
        title || 'New dialog',
        model || 'gpt-4o-mini',
        systemPrompt || null,
      ],
    );
    return rows[0];
  }

  async findAll(username: string, limit = 10) {
    const { rows } = await this.db.query(
      `SELECT
         c.*,
         (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
         (SELECT COUNT(*)::int FROM messages WHERE conversation_id = c.id) AS message_count
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
      'SELECT * FROM conversations WHERE id = $1 AND username = $2',
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

    // Load expert opinions for consilium messages
    const consiliumMessageIds = messageRows
      .filter((m) => m.is_consilium)
      .map((m) => m.id);

    let expertOpinions: Record<string, any[]> = {};
    if (consiliumMessageIds.length > 0) {
      const placeholders = consiliumMessageIds.map((_, i) => `$${i + 1}`).join(',');
      const { rows: opinionRows } = await this.db.query(
        `SELECT * FROM expert_opinions WHERE message_id IN (${placeholders}) ORDER BY id ASC`,
        consiliumMessageIds,
      );

      for (const opinion of opinionRows) {
        if (!expertOpinions[opinion.message_id]) {
          expertOpinions[opinion.message_id] = [];
        }
        expertOpinions[opinion.message_id].push(opinion);
      }
    }

    const messages = messageRows.map((m) => ({
      ...m,
      expertOpinions: m.is_consilium ? (expertOpinions[m.id] || []) : undefined,
    }));

    return { ...conversation, messages };
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
      `INSERT INTO messages (id, conversation_id, role, content, model, token_count, prompt_tokens, completion_tokens, cost, is_consilium)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        metadata?.isConsilium || false,
      ],
    );

    // Update conversation's updated_at
    await this.db.query(
      'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
      [conversationId],
    );

    return rows[0];
  }

  async addExpertOpinions(messageId: string, opinions: ExpertOpinionInput[]) {
    if (opinions.length === 0) return;

    const placeholders: string[] = [];
    const values: any[] = [];

    for (let i = 0; i < opinions.length; i++) {
      const offset = i * 5;
      const id = crypto.randomUUID();
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`,
      );
      values.push(
        id,
        messageId,
        opinions[i].expertName,
        opinions[i].content,
        opinions[i].isError || false,
      );
    }

    await this.db.query(
      `INSERT INTO expert_opinions (id, message_id, expert_name, content, is_error)
       VALUES ${placeholders.join(', ')}`,
      values,
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
      'SELECT * FROM conversations WHERE id = $1',
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
}
