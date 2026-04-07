import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../database/base.repository';
import { DatabaseService } from '../../database/database.service';

export interface Conversation {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  model: string;
  systemPrompt: string | null;
  temperature: number | null;
  maxTokens: number | null;
  repetitionPenalty: number | null;
  contextLimit: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateConversationData {
  projectId: string;
  userId: string;
  title?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  repetitionPenalty?: number;
  contextLimit?: number;
}

type UpdateConversationData = Partial<{
  title: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  repetitionPenalty: number;
  contextLimit: number;
}>;

const COLUMN_MAP: Record<string, string> = {
  title: 'title',
  model: 'model',
  systemPrompt: 'system_prompt',
  temperature: 'temperature',
  maxTokens: 'max_tokens',
  repetitionPenalty: 'repetition_penalty',
  contextLimit: 'context_limit',
};

function mapRow(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    userId: row.user_id as string,
    title: row.title as string,
    model: row.model as string,
    systemPrompt: (row.system_prompt as string) ?? null,
    temperature: row.temperature != null ? parseFloat(String(row.temperature)) : null,
    maxTokens: (row.max_tokens as number) ?? null,
    repetitionPenalty: row.repetition_penalty != null ? parseFloat(String(row.repetition_penalty)) : null,
    contextLimit: (row.context_limit as number) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

@Injectable()
export class ConversationRepository extends BaseRepository<Conversation> {
  constructor(db: DatabaseService) {
    super(db, 'conversations');
  }

  async findByProjectId(projectId: string): Promise<Conversation[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM conversations WHERE project_id = $1 ORDER BY updated_at DESC`,
      [projectId],
    );
    return rows.map(mapRow);
  }

  async findByUserId(userId: string): Promise<Conversation[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC`,
      [userId],
    );
    return rows.map(mapRow);
  }

  async create(data: CreateConversationData): Promise<Conversation> {
    const id = crypto.randomUUID();
    const { rows } = await this.db.query(
      `INSERT INTO conversations (id, project_id, user_id, title, model, system_prompt, temperature, max_tokens, repetition_penalty, context_limit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        data.projectId,
        data.userId,
        data.title || 'New dialog',
        data.model || 'gpt-4o-mini',
        data.systemPrompt || null,
        data.temperature ?? null,
        data.maxTokens ?? null,
        data.repetitionPenalty ?? null,
        data.contextLimit ?? null,
      ],
    );
    return mapRow(rows[0]);
  }

  async update(id: string, data: UpdateConversationData): Promise<Conversation> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const [key, value] of Object.entries(data)) {
      const column = COLUMN_MAP[key];
      if (column && value !== undefined) {
        sets.push(`${column} = $${paramIdx++}`);
        values.push(value);
      }
    }

    sets.push('updated_at = NOW()');
    values.push(id);

    const { rows } = await this.db.query(
      `UPDATE conversations SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values,
    );

    return mapRow(rows[0]);
  }

  async findByIdAndUserId(id: string, userId: string): Promise<Conversation | null> {
    const { rows } = await this.db.query(
      `SELECT * FROM conversations WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }
}
