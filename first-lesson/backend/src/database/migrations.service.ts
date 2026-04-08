import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Injectable()
export class MigrationsService {
  private readonly logger = new Logger(MigrationsService.name);

  constructor(
    @Inject(forwardRef(() => DatabaseService))
    private readonly db: DatabaseService,
  ) {}

  async runMigrations(): Promise<void> {
    this.logger.log('Running migrations — ensuring schema exists...');

    await this.createNewSchema();

    this.logger.log('Migrations completed successfully');
  }

  private async createNewSchema(): Promise<void> {
    // 1. users
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)
    `);

    // 2. user_profiles
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        response_language VARCHAR(10) NOT NULL DEFAULT 'auto',
        dialogue_style VARCHAR(30) NOT NULL DEFAULT 'friendly',
        response_brevity VARCHAR(20) NOT NULL DEFAULT 'unset',
        custom_prompt TEXT NOT NULL DEFAULT '',
        preferences JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 3. projects
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(user_id, status)
    `);

    // 4. project_invariants
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS project_invariants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_project_invariants_project ON project_invariants(project_id)
    `);

    // 5. conversations
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL DEFAULT 'New dialog',
        model VARCHAR(50) NOT NULL DEFAULT 'gpt-4o-mini',
        system_prompt TEXT,
        temperature DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        max_tokens INTEGER NOT NULL DEFAULT 16384,
        repetition_penalty DOUBLE PRECISION NOT NULL DEFAULT 0,
        context_limit INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id)
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC)
    `);

    // 6. conversation_contexts (without active_branch_id FK — added later)
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS conversation_contexts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
        strategy_type VARCHAR(30) NOT NULL DEFAULT 'sliding_window',
        strategy_data JSONB NOT NULL DEFAULT '{}',
        summary TEXT,
        summary_up_to_index INTEGER DEFAULT 0,
        active_branch_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_contexts_conversation ON conversation_contexts(conversation_id)
    `);

    // 7. conversation_branches
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS conversation_branches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context_id UUID NOT NULL REFERENCES conversation_contexts(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL DEFAULT 'main',
        parent_branch_id UUID REFERENCES conversation_branches(id) ON DELETE SET NULL,
        checkpoint_message_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_branches_context ON conversation_branches(context_id)
    `);

    // 8. messages (envelope)
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES conversation_branches(id) ON DELETE SET NULL,
        user_content TEXT NOT NULL,
        assistant_content TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        current_step VARCHAR(50),
        attempt_number INTEGER NOT NULL DEFAULT 1,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at)
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_branch ON messages(branch_id)
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status)
    `);

    // 9. message_steps
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS message_steps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        step_type VARCHAR(50) NOT NULL,
        attempt_number INTEGER NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'running',
        input_context JSONB,
        output_result JSONB,
        model VARCHAR(50),
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        cost DOUBLE PRECISION DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        validation_passed BOOLEAN,
        validation_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_message_steps_message ON message_steps(message_id, created_at)
    `);

    // 10. message_meta
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS message_meta (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
        applied_model VARCHAR(50),
        applied_temperature DOUBLE PRECISION,
        applied_max_tokens INTEGER,
        applied_repetition_penalty DOUBLE PRECISION,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        cost DOUBLE PRECISION DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        context_used_tokens INTEGER DEFAULT 0,
        context_max_tokens INTEGER DEFAULT 0,
        truncated_messages INTEGER DEFAULT 0,
        truncated_tokens INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_message_meta_message ON message_meta(message_id)
    `);

    // 11. message_debug
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS message_debug (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
        strategy_type VARCHAR(30),
        context_messages_count INTEGER DEFAULT 0,
        context_messages_after_truncation INTEGER DEFAULT 0,
        token_breakdown JSONB,
        facts_snapshot JSONB,
        branch_info JSONB,
        summary_info JSONB,
        strategy_metadata JSONB,
        memory_layers JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_message_debug_message ON message_debug(message_id)
    `);

    // 12. checkpoints
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        label VARCHAR(200),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_checkpoints_conv ON checkpoints(conversation_id)
    `);

    // 13. ALTER for circular FK: conversation_contexts -> conversation_branches
    await this.db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_contexts_active_branch'
        ) THEN
          ALTER TABLE conversation_contexts
            ADD CONSTRAINT fk_contexts_active_branch
            FOREIGN KEY (active_branch_id) REFERENCES conversation_branches(id) ON DELETE SET NULL;
        END IF;
      END
      $$
    `);

    // 14. FK for checkpoint_message_id in branches
    await this.db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_branches_checkpoint_message'
        ) THEN
          ALTER TABLE conversation_branches
            ADD CONSTRAINT fk_branches_checkpoint_message
            FOREIGN KEY (checkpoint_message_id) REFERENCES messages(id) ON DELETE SET NULL;
        END IF;
      END
      $$
    `);

    // 15. issue_subscriptions (DEPRECATED: subscriptions are now managed by github-explorer MCP server.
    //     Table kept for backward compatibility with existing installs.)
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS issue_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        repository VARCHAR(500) NOT NULL,
        last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_issue_number INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_issue_subs_active ON issue_subscriptions(is_active, expires_at)
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_issue_subs_conv ON issue_subscriptions(conversation_id)
    `);
    await this.db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_subs_unique ON issue_subscriptions(conversation_id, repository) WHERE is_active = true
    `);

    // 16. issue_notifications
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS issue_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subscription_id UUID NOT NULL REFERENCES issue_subscriptions(id) ON DELETE CASCADE,
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        issue_number INTEGER NOT NULL,
        issue_title TEXT NOT NULL,
        issue_url TEXT NOT NULL,
        issue_author VARCHAR(200),
        summary TEXT,
        is_read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_issue_notif_sub ON issue_notifications(subscription_id)
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_issue_notif_conv ON issue_notifications(conversation_id, created_at DESC)
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_issue_notif_unread ON issue_notifications(conversation_id, is_read) WHERE is_read = false
    `);

    // 16b. Deduplicate: one notification per subscription + issue
    // First remove duplicates keeping only the oldest row per (subscription_id, issue_number)
    await this.db.query(`
      DELETE FROM issue_notifications a
      USING issue_notifications b
      WHERE a.subscription_id IS NOT NULL
        AND a.subscription_id = b.subscription_id
        AND a.issue_number = b.issue_number
        AND a.created_at > b.created_at
    `);
    await this.db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_notif_dedup
        ON issue_notifications(subscription_id, issue_number)
        WHERE subscription_id IS NOT NULL
    `);

    // 17. Migration: drop FK and make subscription_id nullable in issue_notifications
    // (subscriptions now managed by github-explorer MCP, subscription_id may not reference local table)
    await this.db.query(`
      ALTER TABLE issue_notifications
        DROP CONSTRAINT IF EXISTS issue_notifications_subscription_id_fkey
    `);
    await this.db.query(`
      ALTER TABLE issue_notifications
        ALTER COLUMN subscription_id DROP NOT NULL
    `);

    this.logger.log('New schema created successfully');
  }
}
