export interface ReviewContext {
  repo: string;
  owner: string;
  name: string;
  eventName: string;
  prNumber?: number;
  issueNumber?: number;
  baseSha?: string;
  headSha?: string;
  requestedModel?: string;
  requestedProfile?: string;
  requestedTools?: string[];
  labels: string[];
}
