export interface IssueSubscription {
  id: string;
  conversationId: string;
  repository: string;
  lastCheckedAt: string;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
}

export interface IssueNotification {
  id: string;
  subscriptionId: string;
  conversationId: string;
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  issueAuthor: string;
  summary: string;
  isRead: boolean;
  createdAt: string;
}

export type NotificationSSEEvent =
  | { type: 'new_issue'; notification: IssueNotification }
  | { type: 'heartbeat' };
