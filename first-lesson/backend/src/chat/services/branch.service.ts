import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface ConversationBranch {
  id: string;
  conversation_id: string;
  name: string;
  parent_branch_id: string | null;
  checkpoint_message_id: string | null;
  created_at: string;
  message_count?: number;
}

export interface Checkpoint {
  id: string;
  conversation_id: string;
  message_id: string;
  label: string | null;
  created_at: string;
}

@Injectable()
export class BranchService {
  private readonly logger = new Logger(BranchService.name);

  constructor(private readonly db: DatabaseService) {}

  // ── Checkpoint operations ──

  async createCheckpoint(
    conversationId: string,
    messageId: string,
    label?: string,
  ): Promise<Checkpoint> {
    // Verify message exists and belongs to conversation
    const { rows: msgRows } = await this.db.query(
      `SELECT id, created_at FROM messages WHERE id = $1 AND conversation_id = $2`,
      [messageId, conversationId],
    );

    if (msgRows.length === 0) {
      throw new BadRequestException('Message not found in this conversation');
    }

    // Create checkpoint
    const { rows: cpRows } = await this.db.query(
      `INSERT INTO checkpoints (conversation_id, message_id, label)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [conversationId, messageId, label || null],
    );

    const checkpoint = cpRows[0];

    // Check if this is the first checkpoint in the conversation
    const { rows: existingCheckpoints } = await this.db.query(
      `SELECT id FROM checkpoints WHERE conversation_id = $1`,
      [conversationId],
    );

    if (existingCheckpoints.length === 1) {
      // First checkpoint: create "main" branch and assign post-checkpoint messages to it
      const { rows: branchRows } = await this.db.query(
        `INSERT INTO conversation_branches (conversation_id, name, checkpoint_message_id)
         VALUES ($1, 'main', $2)
         RETURNING *`,
        [conversationId, messageId],
      );

      const mainBranch = branchRows[0];

      // Messages AFTER the checkpoint message go to "main" branch
      await this.db.query(
        `UPDATE messages SET branch_id = $1
         WHERE conversation_id = $2
           AND branch_id IS NULL
           AND created_at > (SELECT created_at FROM messages WHERE id = $3)`,
        [mainBranch.id, conversationId, messageId],
      );

      // Set active branch
      await this.db.query(
        `UPDATE conversations SET active_branch_id = $1 WHERE id = $2`,
        [mainBranch.id, conversationId],
      );

      this.logger.log(`Created first checkpoint ${checkpoint.id} and main branch ${mainBranch.id} for conversation ${conversationId}`);
    } else {
      this.logger.log(`Created checkpoint ${checkpoint.id} for conversation ${conversationId}`);
    }

    return checkpoint;
  }

  async getCheckpoints(conversationId: string): Promise<Checkpoint[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM checkpoints WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId],
    );
    return rows;
  }

  // ── Branch operations ──

  async createBranch(
    conversationId: string,
    checkpointId: string,
    name: string,
  ): Promise<ConversationBranch> {
    // Verify checkpoint exists and belongs to conversation
    const { rows: cpRows } = await this.db.query(
      `SELECT * FROM checkpoints WHERE id = $1 AND conversation_id = $2`,
      [checkpointId, conversationId],
    );

    if (cpRows.length === 0) {
      throw new BadRequestException('Checkpoint not found in this conversation');
    }

    const checkpoint = cpRows[0];

    // Create new branch
    const { rows } = await this.db.query(
      `INSERT INTO conversation_branches (conversation_id, name, checkpoint_message_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [conversationId, name, checkpoint.message_id],
    );

    const newBranch = rows[0];

    // Activate the new branch
    await this.activateBranch(conversationId, newBranch.id);

    this.logger.log(`Created branch "${name}" (${newBranch.id}) from checkpoint ${checkpointId}`);
    return newBranch;
  }

  async getBranches(conversationId: string): Promise<ConversationBranch[]> {
    const { rows } = await this.db.query(
      `SELECT cb.*,
              (SELECT COUNT(*)::int FROM messages WHERE branch_id = cb.id) AS message_count
       FROM conversation_branches cb
       WHERE cb.conversation_id = $1
       ORDER BY cb.created_at ASC`,
      [conversationId],
    );
    return rows;
  }

  async getActiveBranch(conversationId: string): Promise<ConversationBranch | null> {
    const { rows } = await this.db.query(
      `SELECT cb.* FROM conversation_branches cb
       JOIN conversations c ON c.active_branch_id = cb.id
       WHERE c.id = $1`,
      [conversationId],
    );
    return rows[0] || null;
  }

  async activateBranch(conversationId: string, branchId: string): Promise<void> {
    // Verify branch belongs to conversation
    const { rows } = await this.db.query(
      `SELECT id FROM conversation_branches WHERE id = $1 AND conversation_id = $2`,
      [branchId, conversationId],
    );

    if (rows.length === 0) {
      throw new NotFoundException('Branch not found in this conversation');
    }

    await this.db.query(
      `UPDATE conversations SET active_branch_id = $1 WHERE id = $2`,
      [branchId, conversationId],
    );
  }

  async deleteBranch(branchId: string): Promise<void> {
    const { rows } = await this.db.query(
      `SELECT id, name, conversation_id FROM conversation_branches WHERE id = $1`,
      [branchId],
    );

    if (rows.length === 0) {
      throw new NotFoundException('Branch not found');
    }

    if (rows[0].name === 'main') {
      throw new BadRequestException('Cannot delete the main branch');
    }

    const conversationId = rows[0].conversation_id;

    // If this was the active branch, switch to main
    const { rows: convRows } = await this.db.query(
      `SELECT active_branch_id FROM conversations WHERE id = $1`,
      [conversationId],
    );

    if (convRows[0]?.active_branch_id === branchId) {
      const { rows: mainRows } = await this.db.query(
        `SELECT id FROM conversation_branches WHERE conversation_id = $1 AND name = 'main' LIMIT 1`,
        [conversationId],
      );
      if (mainRows.length > 0) {
        await this.db.query(
          `UPDATE conversations SET active_branch_id = $1 WHERE id = $2`,
          [mainRows[0].id, conversationId],
        );
      }
    }

    // Delete messages belonging to this branch
    await this.db.query(
      `DELETE FROM messages WHERE branch_id = $1`,
      [branchId],
    );

    // Delete the branch
    await this.db.query(
      `DELETE FROM conversation_branches WHERE id = $1`,
      [branchId],
    );
  }

  async getMessagesForBranch(
    conversationId: string,
    branchId: string,
  ): Promise<Array<{ id: string; role: string; content: string; created_at: string; branch_id: string | null; model?: string; token_count?: number; prompt_tokens?: number; completion_tokens?: number; cost?: number; is_consilium?: boolean; duration_ms?: number; current_message_tokens?: number; history_tokens?: number; applied_model?: string; applied_temperature?: number; applied_max_tokens?: number; context_used_tokens?: number; context_max_tokens?: number; truncated_messages?: number; truncated_tokens?: number }>> {
    // Get the branch info
    const { rows: branchRows } = await this.db.query(
      `SELECT * FROM conversation_branches WHERE id = $1 AND conversation_id = $2`,
      [branchId, conversationId],
    );

    if (branchRows.length === 0) {
      throw new NotFoundException('Branch not found');
    }

    const branch = branchRows[0];

    if (!branch.checkpoint_message_id) {
      // No checkpoint — return all messages (legacy/fallback)
      const { rows } = await this.db.query(
        `SELECT * FROM messages
         WHERE conversation_id = $1 AND (branch_id = $2 OR branch_id IS NULL)
         ORDER BY created_at ASC`,
        [conversationId, branchId],
      );
      return rows;
    }

    // Shared messages: up to and including checkpoint message (branch_id IS NULL)
    const { rows: sharedMessages } = await this.db.query(
      `SELECT * FROM messages
       WHERE conversation_id = $1
         AND branch_id IS NULL
         AND created_at <= (SELECT created_at FROM messages WHERE id = $2)
       ORDER BY created_at ASC`,
      [conversationId, branch.checkpoint_message_id],
    );

    // Branch-specific messages
    const { rows: branchMessages } = await this.db.query(
      `SELECT * FROM messages
       WHERE conversation_id = $1 AND branch_id = $2
       ORDER BY created_at ASC`,
      [conversationId, branchId],
    );

    return [...sharedMessages, ...branchMessages];
  }

  async getMessagesForBranchContext(
    conversationId: string,
    branchId: string,
  ): Promise<Array<{ role: string; content: string }>> {
    const messages = await this.getMessagesForBranch(conversationId, branchId);
    return messages.map(m => ({ role: m.role, content: m.content }));
  }
}
