import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface ConversationBranch {
  id: string;
  conversation_id: string;
  name: string;
  parent_branch_id: string | null;
  checkpoint_message_id: string | null;
  created_at: string;
}

@Injectable()
export class BranchService {
  private readonly logger = new Logger(BranchService.name);

  constructor(private readonly db: DatabaseService) {}

  async ensureMainBranch(conversationId: string): Promise<ConversationBranch> {
    // Check if main branch exists
    const { rows: existing } = await this.db.query(
      `SELECT * FROM conversation_branches WHERE conversation_id = $1 AND name = 'main' LIMIT 1`,
      [conversationId],
    );

    if (existing.length > 0) {
      return existing[0];
    }

    // Create main branch
    const { rows } = await this.db.query(
      `INSERT INTO conversation_branches (id, conversation_id, name)
       VALUES (gen_random_uuid(), $1, 'main')
       RETURNING *`,
      [conversationId],
    );

    const mainBranch = rows[0];

    // Assign existing messages (with NULL branch_id) to the main branch
    await this.db.query(
      `UPDATE messages SET branch_id = $1 WHERE conversation_id = $2 AND branch_id IS NULL`,
      [mainBranch.id, conversationId],
    );

    // Set as active branch
    await this.db.query(
      `UPDATE conversations SET active_branch_id = $1 WHERE id = $2`,
      [mainBranch.id, conversationId],
    );

    this.logger.log(`Created main branch ${mainBranch.id} for conversation ${conversationId}`);
    return mainBranch;
  }

  async createBranch(
    conversationId: string,
    name: string,
    checkpointMessageId: string,
  ): Promise<ConversationBranch> {
    // Ensure main branch exists first
    const mainBranch = await this.ensureMainBranch(conversationId);

    // Verify checkpoint message exists and belongs to this conversation
    const { rows: msgRows } = await this.db.query(
      `SELECT id FROM messages WHERE id = $1 AND conversation_id = $2`,
      [checkpointMessageId, conversationId],
    );

    if (msgRows.length === 0) {
      throw new BadRequestException('Checkpoint message not found in this conversation');
    }

    // Get current active branch as parent
    const activeBranch = await this.getActiveBranch(conversationId);
    const parentBranchId = activeBranch?.id || mainBranch.id;

    const { rows } = await this.db.query(
      `INSERT INTO conversation_branches (id, conversation_id, name, parent_branch_id, checkpoint_message_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       RETURNING *`,
      [conversationId, name, parentBranchId, checkpointMessageId],
    );

    const newBranch = rows[0];

    // Activate the new branch
    await this.activateBranch(conversationId, newBranch.id);

    this.logger.log(`Created branch "${name}" (${newBranch.id}) at checkpoint ${checkpointMessageId}`);
    return newBranch;
  }

  async getBranches(conversationId: string): Promise<ConversationBranch[]> {
    const { rows } = await this.db.query(
      `SELECT cb.*, (SELECT COUNT(*)::int FROM messages WHERE branch_id = cb.id) AS message_count
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
    // Cannot delete main branch
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
  ): Promise<Array<{ role: string; content: string }>> {
    // Get the branch info
    const { rows: branchRows } = await this.db.query(
      `SELECT * FROM conversation_branches WHERE id = $1 AND conversation_id = $2`,
      [branchId, conversationId],
    );

    if (branchRows.length === 0) {
      throw new NotFoundException('Branch not found');
    }

    const branch = branchRows[0];

    if (branch.name === 'main' || !branch.checkpoint_message_id) {
      // Main branch: return all messages with this branch_id (or NULL for legacy)
      const { rows } = await this.db.query(
        `SELECT role, content FROM messages
         WHERE conversation_id = $1 AND (branch_id = $2 OR branch_id IS NULL)
         ORDER BY created_at ASC`,
        [conversationId, branchId],
      );
      return rows;
    }

    // Non-main branch: shared messages up to checkpoint + branch-specific messages
    // Shared messages: messages from parent branch up to and including checkpoint
    const { rows: sharedMessages } = await this.db.query(
      `SELECT role, content FROM messages
       WHERE conversation_id = $1
         AND created_at <= (SELECT created_at FROM messages WHERE id = $2)
         AND (branch_id = $3 OR branch_id IS NULL)
       ORDER BY created_at ASC`,
      [conversationId, branch.checkpoint_message_id, branch.parent_branch_id],
    );

    // Branch-specific messages
    const { rows: branchMessages } = await this.db.query(
      `SELECT role, content FROM messages
       WHERE conversation_id = $1 AND branch_id = $2
       ORDER BY created_at ASC`,
      [conversationId, branchId],
    );

    return [...sharedMessages, ...branchMessages];
  }
}
