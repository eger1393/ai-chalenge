import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../database/base.repository';
import { DatabaseService } from '../../database/database.service';

export interface Checkpoint {
  id: string;
  conversation_id: string;
  message_id: string;
  label: string | null;
  created_at: Date;
}

@Injectable()
export class CheckpointRepository extends BaseRepository<Checkpoint> {
  constructor(db: DatabaseService) {
    super(db, 'checkpoints');
  }

  async findByConversationId(conversationId: string): Promise<Checkpoint[]> {
    const { rows } = await this.db.query<Checkpoint>(
      `SELECT * FROM checkpoints WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId],
    );
    return rows;
  }

  async create(
    conversationId: string,
    messageId: string,
    label?: string,
  ): Promise<Checkpoint> {
    const { rows } = await this.db.query<Checkpoint>(
      `INSERT INTO checkpoints (id, conversation_id, message_id, label)
       VALUES (gen_random_uuid(), $1, $2, $3)
       RETURNING *`,
      [conversationId, messageId, label || null],
    );
    return rows[0];
  }
}
