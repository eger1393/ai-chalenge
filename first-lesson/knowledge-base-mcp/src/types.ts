export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type StructuredJson = JsonValue[] | { [key: string]: JsonValue };

export type EntryContent = string | StructuredJson;

export interface KnowledgeBaseEntry {
  entry_id: string;
  tags: string[];
  content_type: 'text' | 'json';
  content: EntryContent;
  created_at: string;
  updated_at: string;
}
