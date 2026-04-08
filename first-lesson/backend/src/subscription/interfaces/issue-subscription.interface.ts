export interface IssueSubscription {
  id: string;
  conversationId: string;
  userId: string;
  repository: string;
  lastCheckedAt: Date;
  lastIssueNumber: number;
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
}
