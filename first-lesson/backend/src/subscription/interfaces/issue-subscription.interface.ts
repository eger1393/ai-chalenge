export interface IssueSubscription {
  id: string;
  repository: string;
  conversation_id?: string;
  user_id?: string;
  expires_at?: string;
  is_active?: boolean;
  created_at?: string;
  ttl_minutes?: number;
}
