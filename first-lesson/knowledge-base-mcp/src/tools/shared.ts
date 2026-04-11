import type { EntryContent, JsonValue, KnowledgeBaseEntry, StructuredJson } from '../types.js';

interface EntryRow {
  id: string;
  content_type: 'text' | 'json';
  text_content: string | null;
  json_content: StructuredJson | null;
  created_at: Date;
  updated_at: Date;
  tags: string[];
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (typeof value !== 'object') {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}

export function normalizeTag(tag: string): string {
  const normalized = tag.trim();

  if (!normalized) {
    throw new Error('Tag must be a non-empty string');
  }

  return normalized;
}

export function normalizeTags(tags: string[]): string[] {
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error('At least one tag is required');
  }

  const normalized = tags.map(normalizeTag);
  const unique = new Set(normalized);

  if (unique.size !== normalized.length) {
    throw new Error('Tags must be unique within a single entry');
  }

  return normalized;
}

export function normalizeContent(content: unknown): {
  contentType: 'text' | 'json';
  textContent: string | null;
  jsonContent: StructuredJson | null;
} {
  if (typeof content === 'string') {
    if (content.trim().length === 0) {
      throw new Error('Text content must be a non-empty string');
    }

    return {
      contentType: 'text',
      textContent: content,
      jsonContent: null,
    };
  }

  if (
    content === null ||
    typeof content !== 'object' ||
    !isJsonValue(content) ||
    !(Array.isArray(content) || Object.getPrototypeOf(content) === Object.prototype)
  ) {
    throw new Error('Content must be either a non-empty text string or a structured JSON object/array');
  }

  return {
    contentType: 'json',
    textContent: null,
    jsonContent: content as StructuredJson,
  };
}

export function formatEntry(row: EntryRow): KnowledgeBaseEntry {
  const content: EntryContent =
    row.content_type === 'text'
      ? (row.text_content ?? '')
      : (row.json_content ?? {});

  return {
    entry_id: row.id,
    tags: row.tags,
    content_type: row.content_type,
    content,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
