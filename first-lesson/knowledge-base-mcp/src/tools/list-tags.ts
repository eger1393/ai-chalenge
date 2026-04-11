import { getPool } from '../db.js';

interface TagRow {
  tag: string;
}

export async function listTags(): Promise<string> {
  const result = await getPool().query<TagRow>(
    `SELECT tag
     FROM knowledge_base_tags
     ORDER BY tag ASC`,
  );

  return JSON.stringify({
    tags: result.rows.map((row) => row.tag),
  });
}
