import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  pool = new Pool({ connectionString });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mcp_issue_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      repository VARCHAR(500) NOT NULL,
      conversation_id UUID NOT NULL,
      user_id UUID NOT NULL,
      callback_url TEXT NOT NULL,
      last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_issue_number INTEGER NOT NULL DEFAULT 0,
      ttl_minutes INTEGER NOT NULL DEFAULT 1440,
      expires_at TIMESTAMPTZ NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_mcp_subs_active
      ON mcp_issue_subscriptions (is_active, expires_at);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_subs_unique
      ON mcp_issue_subscriptions (conversation_id, repository)
      WHERE is_active = true;
  `);

  console.log('Database initialized: mcp_issue_subscriptions table ready');
}
