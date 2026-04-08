import { getPool } from './db.js';
import { checkNewIssues } from './tools/check-new-issues.js';

interface ActiveSubscription {
  id: string;
  repository: string;
  conversation_id: string;
  user_id: string;
  callback_url: string;
  last_checked_at: Date;
  last_issue_number: number;
}

interface ParsedIssue {
  number: number;
  title: string;
  url: string;
  author: string | null;
  body: string | null;
  labels: string[];
  created_at: string;
}

let isPolling = false;

export function startPoller(): void {
  // Initial check after 30 seconds
  setTimeout(() => {
    pollAll().catch((err) => {
      console.error('Initial poll failed:', err);
    });
  }, 30_000);

  // Regular interval every 5 minutes
  setInterval(() => {
    pollAll().catch((err) => {
      console.error('Poll cycle failed:', err);
    });
  }, 5 * 60 * 1000);

  console.log('Poller started: initial check in 30s, then every 5 minutes');
}

async function pollAll(): Promise<void> {
  if (isPolling) {
    console.warn('Previous polling cycle still running, skipping');
    return;
  }

  isPolling = true;
  try {
    const pool = getPool();

    // 1. Deactivate expired subscriptions
    const deactivated = await pool.query(
      `UPDATE mcp_issue_subscriptions
       SET is_active = false
       WHERE expires_at <= NOW()
         AND is_active = true`,
    );
    if (deactivated.rowCount && deactivated.rowCount > 0) {
      console.log(`Deactivated ${deactivated.rowCount} expired subscriptions`);
    }

    // 2. Fetch active subscriptions
    const result = await pool.query<ActiveSubscription>(
      `SELECT id, repository, conversation_id, user_id, callback_url,
              last_checked_at, last_issue_number
       FROM mcp_issue_subscriptions
       WHERE is_active = true
         AND expires_at > NOW()
       ORDER BY last_checked_at ASC`,
    );

    console.log(`Polling ${result.rows.length} active subscriptions`);

    // 3. Poll each subscription independently
    for (const sub of result.rows) {
      try {
        await pollOne(sub);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error polling ${sub.repository}: ${message}`);
      }
    }
  } finally {
    isPolling = false;
  }
}

async function pollOne(sub: ActiveSubscription): Promise<void> {
  const pool = getPool();

  // Call check_new_issues tool directly
  const resultJson = await checkNewIssues({
    repository: sub.repository,
    since: sub.last_checked_at.toISOString(),
  });

  const parsed: { issues: ParsedIssue[]; totalCount: number } = JSON.parse(resultJson);

  const newIssues = parsed.issues.filter((i) => i.number > sub.last_issue_number);

  if (newIssues.length === 0) {
    // Update last_checked_at even when no new issues found
    await pool.query(
      `UPDATE mcp_issue_subscriptions
       SET last_checked_at = NOW()
       WHERE id = $1`,
      [sub.id],
    );
    return;
  }

  // Send callback notification
  try {
    const payload = {
      subscription_id: sub.id,
      conversation_id: sub.conversation_id,
      user_id: sub.user_id,
      repository: sub.repository,
      issues: newIssues,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const secret = process.env.MCP_CALLBACK_SECRET;
    if (secret) {
      headers['X-MCP-Secret'] = secret;
    }

    const response = await fetch(sub.callback_url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        `Callback failed for ${sub.repository}: ${response.status} ${response.statusText}`,
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Callback request failed for ${sub.repository}: ${message}`);
  }

  // Update watermark
  const maxIssueNumber = Math.max(sub.last_issue_number, ...newIssues.map((i) => i.number));
  await pool.query(
    `UPDATE mcp_issue_subscriptions
     SET last_checked_at = NOW(),
         last_issue_number = $2
     WHERE id = $1`,
    [sub.id, maxIssueNumber],
  );

  console.log(`Found ${newIssues.length} new issues in ${sub.repository}`);
}
