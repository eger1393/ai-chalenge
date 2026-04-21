import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../database/base.repository';
import { DatabaseService } from '../../database/database.service';
import {
  DEFAULT_PROVIDER,
  getDefaultModelForProvider,
  type AIProvider,
} from '../../ai/dto/ai-params.dto';
import { DEFAULT_RAG_MODE, normalizeRagMode, type RagMode } from '../../rag/constants';

export interface Conversation {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  provider: AIProvider;
  model: string;
  systemPrompt: string | null;
  temperature: number | null;
  maxTokens: number | null;
  repetitionPenalty: number | null;
  contextLimit: number | null;
  ragEnabled: boolean;
  ragQueryRewriteEnabled: boolean;
  ragMode: RagMode;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateConversationData {
  projectId: string;
  userId: string;
  title?: string;
  provider?: AIProvider;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  repetitionPenalty?: number;
  contextLimit?: number;
  ragEnabled?: boolean;
  ragQueryRewriteEnabled?: boolean;
  ragMode?: RagMode;
}

type UpdateConversationData = Partial<{
  title: string;
  provider: AIProvider;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  repetitionPenalty: number;
  contextLimit: number;
  ragEnabled: boolean;
  ragQueryRewriteEnabled: boolean;
  ragMode: RagMode;
}>;

const COLUMN_MAP: Record<string, string> = {
  title: 'title',
  provider: 'provider',
  model: 'model',
  systemPrompt: 'system_prompt',
  temperature: 'temperature',
  maxTokens: 'max_tokens',
  repetitionPenalty: 'repetition_penalty',
  contextLimit: 'context_limit',
  ragEnabled: 'rag_enabled',
  ragQueryRewriteEnabled: 'rag_query_rewrite_enabled',
  ragMode: 'rag_mode',
};

function mapRow(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    userId: row.user_id as string,
    title: row.title as string,
    provider: ((row.provider as string) ?? DEFAULT_PROVIDER) as AIProvider,
    model: row.model as string,
    systemPrompt: (row.system_prompt as string) ?? null,
    temperature: row.temperature != null ? parseFloat(String(row.temperature)) : null,
    maxTokens: (row.max_tokens as number) ?? null,
    repetitionPenalty: row.repetition_penalty != null ? parseFloat(String(row.repetition_penalty)) : null,
    contextLimit: (row.context_limit as number) ?? null,
    ragEnabled: Boolean(row.rag_enabled),
    ragQueryRewriteEnabled: Boolean(row.rag_query_rewrite_enabled),
    ragMode: normalizeRagMode(row.rag_mode),
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

@Injectable()
export class ConversationRepository extends BaseRepository<Conversation> {
  constructor(db: DatabaseService) {
    super(db, 'conversations');
  }

  async findByProjectIdAndUserId(projectId: string, userId: string): Promise<Conversation[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM conversations
       WHERE project_id = $1 AND user_id = $2
       ORDER BY updated_at DESC`,
      [projectId, userId],
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

  async findById(id: string): Promise<Conversation | null> {
    const { rows } = await this.db.query(`SELECT * FROM conversations WHERE id = $1`, [id]);
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }

  async create(data: CreateConversationData): Promise<Conversation> {
    const id = crypto.randomUUID();
    const provider = data.provider ?? DEFAULT_PROVIDER;
    const { rows } = await this.db.query(
      `INSERT INTO conversations (id, project_id, user_id, title, provider, model, system_prompt, temperature, max_tokens, repetition_penalty, context_limit, rag_enabled, rag_query_rewrite_enabled, rag_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        id,
        data.projectId,
        data.userId,
        data.title || 'New dialog',
        provider,
        data.model || getDefaultModelForProvider(provider),
        data.systemPrompt || null,
        data.temperature ?? 1.0,
        data.maxTokens ?? 16384,
        data.repetitionPenalty ?? 0,
        data.contextLimit ?? 128000,
        data.ragEnabled ?? false,
        data.ragQueryRewriteEnabled ?? false,
        data.ragMode ?? DEFAULT_RAG_MODE,
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
