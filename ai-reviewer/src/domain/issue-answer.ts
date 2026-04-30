export interface IssueAnswerContext {
  repo: string;
  owner: string;
  name: string;
  eventName: string;
  issueNumber: number;
  title: string;
  body: string;
  author?: string;
  labels: string[];
  requestedModel?: string;
  isPullRequest: boolean;
}

export interface IssueAnswerResult {
  answer: string;
  confidence: "low" | "medium" | "high";
  sources: string[];
}
