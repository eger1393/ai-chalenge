import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../database/base.repository';
import { DatabaseService } from '../../database/database.service';

export interface Branch {
  id: string;
  context_id: string;
  name: string;
  parent_branch_id: string | null;
  checkpoint_message_id: string | null;
  created_at: Date;
}

@Injectable()
export class BranchRepository extends BaseRepository<Branch> {
  constructor(db: DatabaseService) {
    super(db, 'conversation_branches');
  }

  async findByContextId(contextId: string): Promise<Branch[]> {
    const { rows } = await this.db.query<Branch>(
      `SELECT * FROM conversation_branches WHERE context_id = $1 ORDER BY created_at ASC`,
      [contextId],
    );
    return rows;
  }

  async create(
    contextId: string,
    name: string,
    parentBranchId?: string,
    checkpointMessageId?: string,
  ): Promise<Branch> {
    const { rows } = await this.db.query<Branch>(
      `INSERT INTO conversation_branches (id, context_id, name, parent_branch_id, checkpoint_message_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       RETURNING *`,
      [contextId, name, parentBranchId || null, checkpointMessageId || null],
    );
    return rows[0];
  }

  async findByIdAndContextId(id: string, contextId: string): Promise<Branch | null> {
    const { rows } = await this.db.query<Branch>(
      `SELECT * FROM conversation_branches WHERE id = $1 AND context_id = $2`,
      [id, contextId],
    );
    return rows[0] || null;
  }
}
