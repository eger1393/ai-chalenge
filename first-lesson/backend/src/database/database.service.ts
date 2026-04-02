import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool, QueryResult } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;
  private readonly logger = new Logger(DatabaseService.name);

  async onModuleInit() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    // Verify connection
    const client = await this.pool.connect();
    this.logger.log('Connected to PostgreSQL');
    client.release();

    await this.runMigrations();
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.logger.log('PostgreSQL pool closed');
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }

  private async runMigrations() {
    // Create migrations tracking table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrations = this.getMigrations();

    for (const migration of migrations) {
      const { rows } = await this.pool.query(
        'SELECT id FROM _migrations WHERE name = $1',
        [migration.name],
      );

      if (rows.length === 0) {
        this.logger.log(`Running migration: ${migration.name}`);
        await this.pool.query(migration.sql);
        await this.pool.query(
          'INSERT INTO _migrations (name) VALUES ($1)',
          [migration.name],
        );
        this.logger.log(`Migration applied: ${migration.name}`);
      }
    }
  }

  private getMigrations(): Array<{ name: string; sql: string }> {
    return [
      {
        name: '001_create_conversations',
        sql: `
          CREATE TABLE IF NOT EXISTS conversations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username VARCHAR(100) NOT NULL,
            title VARCHAR(200) NOT NULL DEFAULT 'New dialog',
            model VARCHAR(50) NOT NULL DEFAULT 'gpt-4o-mini',
            system_prompt TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
            content TEXT NOT NULL,
            model VARCHAR(50),
            token_count INTEGER DEFAULT 0,
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            cost DOUBLE PRECISION DEFAULT 0,
            is_consilium BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS expert_opinions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            expert_name VARCHAR(100) NOT NULL,
            content TEXT NOT NULL,
            is_error BOOLEAN NOT NULL DEFAULT FALSE
          );

          CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
          CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
          CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
          CREATE INDEX IF NOT EXISTS idx_conversations_username ON conversations(username);
          CREATE INDEX IF NOT EXISTS idx_expert_opinions_message ON expert_opinions(message_id);
        `,
      },
      {
        name: '002_add_message_metadata',
        sql: `
          ALTER TABLE messages ADD COLUMN IF NOT EXISTS duration_ms INTEGER DEFAULT 0;
          ALTER TABLE messages ADD COLUMN IF NOT EXISTS current_message_tokens INTEGER DEFAULT 0;
          ALTER TABLE messages ADD COLUMN IF NOT EXISTS history_tokens INTEGER DEFAULT 0;
          ALTER TABLE messages ADD COLUMN IF NOT EXISTS applied_model VARCHAR(50);
          ALTER TABLE messages ADD COLUMN IF NOT EXISTS applied_temperature DOUBLE PRECISION;
          ALTER TABLE messages ADD COLUMN IF NOT EXISTS applied_max_tokens INTEGER;
        `,
      },
      {
        name: '003_add_context_truncation',
        sql: `
          ALTER TABLE messages ADD COLUMN IF NOT EXISTS context_used_tokens INTEGER DEFAULT 0;
          ALTER TABLE messages ADD COLUMN IF NOT EXISTS context_max_tokens INTEGER DEFAULT 0;
          ALTER TABLE messages ADD COLUMN IF NOT EXISTS truncated_messages INTEGER DEFAULT 0;
          ALTER TABLE messages ADD COLUMN IF NOT EXISTS truncated_tokens INTEGER DEFAULT 0;
        `,
      },
      {
        name: '004_add_conversation_summary',
        sql: `
          ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary TEXT;
          ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary_up_to_index INTEGER DEFAULT 0;
        `,
      },
      {
        name: '005_add_context_strategy',
        sql: `
          ALTER TABLE conversations ADD COLUMN IF NOT EXISTS context_strategy VARCHAR(30) NOT NULL DEFAULT 'sliding_window';
        `,
      },
      {
        name: '006_create_conversation_facts',
        sql: `
          CREATE TABLE IF NOT EXISTS conversation_facts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            fact_key VARCHAR(200) NOT NULL,
            fact_value TEXT NOT NULL,
            source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(conversation_id, fact_key)
          );
          CREATE INDEX IF NOT EXISTS idx_conversation_facts_conv ON conversation_facts(conversation_id);
        `,
      },
      {
        name: '007_create_branches',
        sql: `
          CREATE TABLE IF NOT EXISTS conversation_branches (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            name VARCHAR(200) NOT NULL DEFAULT 'main',
            parent_branch_id UUID REFERENCES conversation_branches(id) ON DELETE SET NULL,
            checkpoint_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_branches_conv ON conversation_branches(conversation_id);
          ALTER TABLE messages ADD COLUMN IF NOT EXISTS branch_id UUID;
          CREATE INDEX IF NOT EXISTS idx_messages_branch ON messages(branch_id);
          ALTER TABLE conversations ADD COLUMN IF NOT EXISTS active_branch_id UUID;
        `,
      },
      {
        name: '008_add_test_mode',
        sql: `
          ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
          ALTER TABLE conversations ADD COLUMN IF NOT EXISTS test_topic TEXT;
          ALTER TABLE conversations ADD COLUMN IF NOT EXISTS test_pairs_target INTEGER DEFAULT 0;
          CREATE INDEX IF NOT EXISTS idx_conversations_is_test ON conversations(is_test);
        `,
      },
      {
        name: '009_create_message_debug_data',
        sql: `
          CREATE TABLE IF NOT EXISTS message_debug_data (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            strategy_type VARCHAR(30),
            context_messages_count INTEGER DEFAULT 0,
            context_messages_after_truncation INTEGER DEFAULT 0,
            facts_snapshot JSONB,
            branch_info JSONB,
            summary_info JSONB,
            token_breakdown JSONB,
            strategy_metadata JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(message_id)
          );
          CREATE INDEX IF NOT EXISTS idx_message_debug_data_message ON message_debug_data(message_id);
        `,
      },
      {
        name: '010_create_checkpoints',
        sql: `
          CREATE TABLE IF NOT EXISTS checkpoints (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            label VARCHAR(200),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_checkpoints_conv ON checkpoints(conversation_id);
        `,
      },
      {
        name: '011_create_tasks',
        sql: `
          CREATE TABLE IF NOT EXISTS tasks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username VARCHAR(100) NOT NULL,
            title VARCHAR(200) NOT NULL,
            description TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_tasks_username ON tasks(username);
          CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(username, status);
        `,
      },
      {
        name: '012_create_user_profiles',
        sql: `
          CREATE TABLE IF NOT EXISTS user_profiles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username VARCHAR(100) NOT NULL UNIQUE,
            response_language VARCHAR(10) NOT NULL DEFAULT 'auto',
            dialogue_style VARCHAR(30) NOT NULL DEFAULT 'friendly',
            response_brevity VARCHAR(20) NOT NULL DEFAULT 'unset',
            custom_prompt TEXT NOT NULL DEFAULT '',
            preferences JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `,
      },
      {
        name: '013_add_task_id_to_conversations',
        sql: `
          ALTER TABLE conversations ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
          CREATE INDEX IF NOT EXISTS idx_conversations_task_id ON conversations(task_id);
        `,
      },
      {
        name: '014_add_memory_layers_to_debug_data',
        sql: `
          ALTER TABLE message_debug_data ADD COLUMN IF NOT EXISTS memory_layers JSONB;
        `,
      },
      {
        name: '015_create_users',
        sql: `
          CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username VARCHAR(100) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        `,
      },
      {
        name: '016_create_pipeline_tables',
        sql: `
          CREATE TABLE IF NOT EXISTS pipeline_runs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            user_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'running'
              CHECK (status IN ('running', 'paused', 'completed', 'failed', 'cancelled')),
            current_step VARCHAR(20) NOT NULL DEFAULT 'planning'
              CHECK (current_step IN ('planning', 'execution', 'validation', 'done')),
            attempt_number INTEGER NOT NULL DEFAULT 1,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            paused_at_step VARCHAR(20),
            error_message TEXT,
            total_cost DOUBLE PRECISION DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_pipeline_runs_conv ON pipeline_runs(conversation_id);
          CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);

          CREATE TABLE IF NOT EXISTS pipeline_steps (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            pipeline_run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
            step_type VARCHAR(20) NOT NULL CHECK (step_type IN ('planning', 'execution', 'validation')),
            attempt_number INTEGER NOT NULL DEFAULT 1,
            status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
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
          );
          CREATE INDEX IF NOT EXISTS idx_pipeline_steps_run ON pipeline_steps(pipeline_run_id);
        `,
      },
      {
        name: '017_create_task_invariants',
        sql: `
          CREATE TABLE IF NOT EXISTS task_invariants (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_task_invariants_task ON task_invariants(task_id);
        `,
      },
    ];
  }
}
