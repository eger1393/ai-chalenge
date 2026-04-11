import type pg from 'pg';
import { withTransaction } from '../db.js';
import type { StructuredJson } from '../types.js';
import { formatEntry, normalizeContent, normalizeTags } from './shared.js';

interface ConflictRow {
  tag: string;
}

interface CreatedEntryRow {
  id: string;
  content_type: 'text' | 'json';
  text_content: string | null;
  json_content: StructuredJson | null;
  created_at: Date;
  updated_at: Date;
}

async function findConflictingTags(client: pg.PoolClient, tags: string[], excludedEntryId?: string): Promise<string[]> {
  const params: unknown[] = [tags];
  let query = `
    SELECT tag
    FROM knowledge_base_tags
    WHERE tag = ANY($1::text[])
  `;

  if (excludedEntryId) {
    query += ' AND entry_id <> $2';
    params.push(excludedEntryId);
  }

  const result = await client.query<ConflictRow>(query, params);
  return result.rows.map((row) => row.tag).sort();
}

async function insertTags(client: pg.PoolClient, entryId: string, tags: string[]): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_base_tags (entry_id, tag)
     SELECT $1, UNNEST($2::text[])`,
    [entryId, tags],
  );
}

export async function createEntry(args: { tags: string[]; content: unknown }): Promise<string> {
  const tags = normalizeTags(args.tags);
  const content = normalizeContent(args.content);

  return withTransaction(async (client) => {
    const conflictingTags = await findConflictingTags(client, tags);
    if (conflictingTags.length > 0) {
      throw new Error(`Cannot create entry. Tags already exist: ${conflictingTags.join(', ')}`);
    }

    const inserted = await client.query<CreatedEntryRow>(
      `INSERT INTO knowledge_base_entries (content_type, text_content, json_content)
       VALUES ($1, $2, $3)
       RETURNING id, content_type, text_content, json_content, created_at, updated_at`,
      [content.contentType, content.textContent, content.jsonContent],
    );

    const row = inserted.rows[0];
    await insertTags(client, row.id, tags);

    return JSON.stringify({
      status: 'created',
      ...formatEntry({
        ...row,
        tags,
      }),
    });
  });
}

export async function replaceEntry(
  args: { tag: string; tags: string[]; content: unknown },
): Promise<string> {
  const lookupTag = args.tag.trim();
  if (!lookupTag) {
    throw new Error('Lookup tag must be a non-empty string');
  }

  const tags = normalizeTags(args.tags);
  const content = normalizeContent(args.content);

  return withTransaction(async (client) => {
    const existing = await client.query<{ entry_id: string }>(
      `SELECT entry_id
       FROM knowledge_base_tags
       WHERE tag = $1
       LIMIT 1`,
      [lookupTag],
    );

    const entryId = existing.rows[0]?.entry_id;
    if (!entryId) {
      throw new Error(`Entry not found for tag "${lookupTag}"`);
    }

    const conflictingTags = await findConflictingTags(client, tags, entryId);
    if (conflictingTags.length > 0) {
      throw new Error(`Cannot replace entry. Tags already exist on another entry: ${conflictingTags.join(', ')}`);
    }

    const updated = await client.query<CreatedEntryRow>(
      `UPDATE knowledge_base_entries
       SET content_type = $2,
           text_content = $3,
           json_content = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, content_type, text_content, json_content, created_at, updated_at`,
      [entryId, content.contentType, content.textContent, content.jsonContent],
    );

    await client.query('DELETE FROM knowledge_base_tags WHERE entry_id = $1', [entryId]);
    await insertTags(client, entryId, tags);

    return JSON.stringify({
      status: 'replaced',
      replaced_by_tag: lookupTag,
      ...formatEntry({
        ...updated.rows[0],
        tags,
      }),
    });
  });
}
