import { getPool } from '../db.js';

interface SubscriptionRow {
  id: string;
  repository: string;
  conversation_id: string;
  expires_at: Date;
}

export async function subscribeToIssues(args: {
  repository: string;
  conversation_id: string;
  user_id: string;
  ttl_minutes?: number;
}): Promise<string> {
  const pool = getPool();
  const ttl = args.ttl_minutes ?? 1440;

  const callbackUrl = process.env.BACKEND_CALLBACK_URL;
  if (!callbackUrl) {
    throw new Error('BACKEND_CALLBACK_URL environment variable is required');
  }

  // Check for existing active subscription
  const existing = await pool.query<SubscriptionRow>(
    `SELECT id, repository, conversation_id, expires_at
     FROM mcp_issue_subscriptions
     WHERE conversation_id = $1
       AND repository = $2
       AND is_active = true`,
    [args.conversation_id, args.repository],
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return JSON.stringify({
      subscription_id: row.id,
      repository: row.repository,
      conversation_id: row.conversation_id,
      expires_at: row.expires_at.toISOString(),
      status: 'existing',
    });
  }

  // Create new subscription
  const inserted = await pool.query<SubscriptionRow>(
    `INSERT INTO mcp_issue_subscriptions
       (repository, conversation_id, user_id, callback_url, ttl_minutes, expires_at)
     VALUES
       ($1, $2, $3, $4, $5, NOW() + $5 * interval '1 minute')
     RETURNING id, repository, conversation_id, expires_at`,
    [args.repository, args.conversation_id, args.user_id, callbackUrl, ttl],
  );

  const row = inserted.rows[0];
  return JSON.stringify({
    subscription_id: row.id,
    repository: row.repository,
    conversation_id: row.conversation_id,
    expires_at: row.expires_at.toISOString(),
    status: 'created',
  });
}
