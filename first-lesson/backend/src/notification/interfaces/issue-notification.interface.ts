export interface IssueNotification {
  id: string;
  subscriptionId: string;
  conversationId: string;
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  issueAuthor: string | null;
  summary: string | null;
  isRead: boolean;
  createdAt: Date;
}

export interface CreateNotificationData {
  subscriptionId: string;
  conversationId: string;
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  issueAuthor?: string;
  summary?: string;
}
