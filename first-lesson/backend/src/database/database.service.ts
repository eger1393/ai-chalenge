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
    ];
  }
}
