import { withTransaction } from '../db.js';
import { formatEntry } from './shared.js';

interface EntryRow {
  id: string;
  content_type: 'text' | 'json';
  text_content: string | null;
  json_content: Record<string, unknown> | unknown[] | null;
  created_at: Date;
  updated_at: Date;
  tags: string[];
}

export async function deleteByTag(args: { tag: string }): Promise<string> {
  const tag = args.tag.trim();
  if (!tag) {
    throw new Error('Tag must be a non-empty string');
  }

  return withTransaction(async (client) => {
    const existing = await client.query<EntryRow>(
      `SELECT
         e.id,
         e.content_type,
         e.text_content,
         e.json_content,
         e.created_at,
         e.updated_at,
         (
           SELECT ARRAY_AGG(t2.tag ORDER BY t2.tag)
           FROM knowledge_base_tags t2
           WHERE t2.entry_id = e.id
         ) AS tags
       FROM knowledge_base_entries e
       INNER JOIN knowledge_base_tags t ON t.entry_id = e.id
       WHERE t.tag = $1
       LIMIT 1`,
      [tag],
    );

    const row = existing.rows[0];
    if (!row) {
      throw new Error(`Entry not found for tag "${tag}"`);
    }

    await client.query(
      'DELETE FROM knowledge_base_entries WHERE id = $1',
      [row.id],
    );

    return JSON.stringify({
      status: 'deleted',
      deleted_by_tag: tag,
      ...formatEntry(row),
    });
  });
}
