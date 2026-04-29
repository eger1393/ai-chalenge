import type { DiffResult, ReviewResult } from "../domain/review.js";
import type { ReviewConfig, ReviewProfile } from "../domain/config.js";
import type { ReviewContext } from "../domain/review-context.js";
import type { ProjectContextSnippet } from "../domain/project-context.js";

export interface ReviewContextInput {
  eventPath?: string;
  repo?: string;
  model?: string;
  profile?: string;
  prNumber?: number;
}

export interface ReviewContextResolver {
  resolve(input: ReviewContextInput): Promise<ReviewContext>;
}

export interface DiffProvider {
  getDiff(context: ReviewContext): Promise<string | undefined>;
}

export interface AiReviewClient {
  review(input: {
    config: ReviewConfig;
    profileName: string;
    profile: ReviewProfile;
    model: string;
    diff: string;
    projectContext: ProjectContextSnippet[];
  }): Promise<ReviewResult>;
}

export interface ProjectContextProvider {
  getContext(input: {
    context: ReviewContext;
    diff: string;
    profileName: string;
  }): Promise<ProjectContextSnippet[]>;
}

export interface ReviewPublisher {
  publish(input: ReviewPublication): Promise<void>;
}

export interface ReviewPublication {
  context: ReviewContext;
  result: ReviewResult;
  model: string;
  profileName: string;
  diff: DiffResult;
  projectContext: ProjectContextSnippet[];
}

export interface OutputWriter {
  write(value: unknown): void;
}
