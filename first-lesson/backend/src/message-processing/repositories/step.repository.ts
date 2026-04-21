import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../database/base.repository';
import { DatabaseService } from '../../database/database.service';

export interface MessageStep {
  id: string;
  messageId: string;
  stepType: string;
  attemptNumber: number;
  status: string;
  inputContext: unknown;
  outputResult: unknown;
  provider: string | null;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  durationMs: number;
  validationPassed: boolean | null;
  validationReason: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

function mapRow(row: Record<string, unknown>): MessageStep {
  return {
    id: row.id as string,
    messageId: row.message_id as string,
    stepType: row.step_type as string,
    attemptNumber: (row.attempt_number as number) ?? 1,
    status: row.status as string,
    inputContext: row.input_context ?? null,
    outputResult: row.output_result ?? null,
    provider: (row.provider as string) ?? null,
    model: (row.model as string) ?? null,
    promptTokens: (row.prompt_tokens as number) ?? 0,
    completionTokens: (row.completion_tokens as number) ?? 0,
    cost: (row.cost as number) ?? 0,
    durationMs: (row.duration_ms as number) ?? 0,
    validationPassed: row.validation_passed != null ? (row.validation_passed as boolean) : null,
    validationReason: (row.validation_reason as string) ?? null,
    createdAt: row.created_at as Date,
    completedAt: (row.completed_at as Date) ?? null,
  };
}

@Injectable()
export class StepRepository extends BaseRepository<MessageStep> {
  constructor(db: DatabaseService) {
    super(db, 'message_steps');
  }

  async findByMessageId(messageId: string): Promise<MessageStep[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM message_steps WHERE message_id = $1 ORDER BY created_at ASC`,
      [messageId],
    );
    return rows.map(mapRow);
  }

  async createStep(data: {
    messageId: string;
    stepType: string;
    attemptNumber: number;
    provider: string;
    model: string;
    inputContext?: unknown;
  }): Promise<MessageStep> {
    const id = crypto.randomUUID();
    const { rows } = await this.db.query(
      `INSERT INTO message_steps (id, message_id, step_type, attempt_number, status, provider, model, input_context)
       VALUES ($1, $2, $3, $4, 'running', $5, $6, $7)
       RETURNING *`,
      [
        id,
        data.messageId,
        data.stepType,
        data.attemptNumber,
        data.provider,
        data.model,
        data.inputContext ? JSON.stringify(data.inputContext) : null,
      ],
    );
    return mapRow(rows[0]);
  }

  async updateStep(
    stepId: string,
    data: Partial<{
      status: string;
      outputResult: unknown;
      promptTokens: number;
      completionTokens: number;
      cost: number;
      durationMs: number;
      validationPassed: boolean;
      validationReason: string;
    }>,
  ): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }
    if (data.outputResult !== undefined) {
      setClauses.push(`output_result = $${paramIndex++}`);
      values.push(JSON.stringify(data.outputResult));
    }
    if (data.promptTokens !== undefined) {
      setClauses.push(`prompt_tokens = $${paramIndex++}`);
      values.push(data.promptTokens);
    }
    if (data.completionTokens !== undefined) {
      setClauses.push(`completion_tokens = $${paramIndex++}`);
      values.push(data.completionTokens);
    }
    if (data.cost !== undefined) {
      setClauses.push(`cost = $${paramIndex++}`);
      values.push(data.cost);
    }
    if (data.durationMs !== undefined) {
      setClauses.push(`duration_ms = $${paramIndex++}`);
      values.push(data.durationMs);
    }
    if (data.validationPassed !== undefined) {
      setClauses.push(`validation_passed = $${paramIndex++}`);
      values.push(data.validationPassed);
    }
    if (data.validationReason !== undefined) {
      setClauses.push(`validation_reason = $${paramIndex++}`);
      values.push(data.validationReason);
    }

    if (setClauses.length === 0) return;

    // Always set completed_at when status changes to completed or failed
    if (data.status === 'completed' || data.status === 'failed') {
      setClauses.push(`completed_at = NOW()`);
    }

    setClauses.push(`created_at = created_at`); // no-op to ensure valid SQL

    values.push(stepId);
    await this.db.query(
      `UPDATE message_steps SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
      values,
    );
  }

  async findCompletedByMessageAndAttempt(
    messageId: string,
    attemptNumber: number,
  ): Promise<MessageStep[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM message_steps
       WHERE message_id = $1 AND attempt_number = $2 AND status = 'completed'
       ORDER BY created_at ASC`,
      [messageId, attemptNumber],
    );
    return rows.map(mapRow);
  }

  async findByMessageAndAttempt(
    messageId: string,
    attemptNumber: number,
  ): Promise<MessageStep[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM message_steps
       WHERE message_id = $1 AND attempt_number = $2
       ORDER BY created_at ASC`,
      [messageId, attemptNumber],
    );
    return rows.map(mapRow);
  }
}
