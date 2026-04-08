import { getPool } from '../db.js';

interface SubscriptionRow {
  id: string;
  repository: string;
  expires_at: Date;
  is_active: boolean;
  created_at: Date;
  ttl_minutes: number;
}

export async function listSubscriptions(args: {
  conversation_id: string;
}): Promise<string> {
  const pool = getPool();

  const result = await pool.query<SubscriptionRow>(
    `SELECT id, repository, expires_at, is_active, created_at, ttl_minutes
     FROM mcp_issue_subscriptions
     WHERE conversation_id = $1
       AND is_active = true
       AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [args.conversation_id],
  );

  const subscriptions = result.rows.map((row) => ({
    id: row.id,
    repository: row.repository,
    expires_at: row.expires_at.toISOString(),
    is_active: row.is_active,
    created_at: row.created_at.toISOString(),
    ttl_minutes: row.ttl_minutes,
  }));

  return JSON.stringify(subscriptions, null, 2);
}
