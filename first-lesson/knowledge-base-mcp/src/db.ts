import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getRequiredDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  return connectionString;
}

function getDatabaseName(connectionString: string): string {
  const url = new URL(connectionString);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));

  if (!databaseName) {
    throw new Error('DATABASE_URL must include a target database name');
  }

  if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error(`Unsafe database name "${databaseName}". Use only letters, numbers and underscores.`);
  }

  return databaseName;
}

function buildAdminConnectionString(connectionString: string): string {
  const url = new URL(connectionString);
  url.pathname = '/postgres';
  return url.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function ensureDatabaseExists(connectionString: string): Promise<void> {
  const databaseName = getDatabaseName(connectionString);
  const adminConnectionString = buildAdminConnectionString(connectionString);
  const adminPool = new Pool({ connectionString: adminConnectionString });

  try {
    const existing = await adminPool.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
      [databaseName],
    );

    if (existing.rows[0]?.exists) {
      return;
    }

    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    console.log(`Database created: ${databaseName}`);
  } finally {
    await adminPool.end();
  }
}

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initDb() first.');
  }

  return pool;
}

export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function initDb(): Promise<void> {
  const connectionString = getRequiredDatabaseUrl();
  await ensureDatabaseExists(connectionString);

  pool = new Pool({ connectionString });

  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    throw new Error(`Не удалось подключить расширение vector. Убедись, что PostgreSQL запущен с поддержкой pgvector. Детали: ${message}`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS knowledge_base_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      content_type VARCHAR(10) NOT NULL CHECK (content_type IN ('text', 'json')),
      text_content TEXT,
      json_content JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_knowledge_base_content
        CHECK (
          (content_type = 'text' AND text_content IS NOT NULL AND json_content IS NULL) OR
          (content_type = 'json' AND text_content IS NULL AND json_content IS NOT NULL)
        )
    );

    CREATE TABLE IF NOT EXISTS knowledge_base_tags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entry_id UUID NOT NULL REFERENCES knowledge_base_entries(id) ON DELETE CASCADE,
      tag TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_base_tags_entry
      ON knowledge_base_tags (entry_id);

    CREATE TABLE IF NOT EXISTS telegram_channel_messages (
      channel_id BIGINT NOT NULL,
      channel_name TEXT NOT NULL,
      message_id BIGINT NOT NULL,
      message_type TEXT NOT NULL,
      published_at TIMESTAMPTZ,
      edited_at TIMESTAMPTZ,
      full_text TEXT NOT NULL,
      has_media BOOLEAN NOT NULL DEFAULT FALSE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (channel_id, message_id)
    );

    CREATE INDEX IF NOT EXISTS idx_telegram_channel_messages_published_at
      ON telegram_channel_messages (channel_id, published_at DESC);

    CREATE TABLE IF NOT EXISTS telegram_message_chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      channel_id BIGINT NOT NULL,
      message_id BIGINT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      char_count INTEGER NOT NULL,
      embedding_model TEXT NOT NULL,
      embedding vector(1024) NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_telegram_message_chunks_message
        FOREIGN KEY (channel_id, message_id)
        REFERENCES telegram_channel_messages(channel_id, message_id)
        ON DELETE CASCADE,
      CONSTRAINT uq_telegram_message_chunks
        UNIQUE (channel_id, message_id, chunk_index)
    );

    CREATE INDEX IF NOT EXISTS idx_telegram_message_chunks_message
      ON telegram_message_chunks (channel_id, message_id);
  `);

  console.log('База знаний и таблицы Telegram готовы к работе');
}
