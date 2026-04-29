import { filterFindings, truncateDiff } from "../domain/review.js";
import { resolveModel, resolveProfile, type ReviewConfig } from "../domain/config.js";
import type { AiReviewClient, DiffProvider, OutputWriter, ProjectContextProvider, ReviewContextInput, ReviewContextResolver, ReviewPublisher } from "./ports.js";

export interface ReviewRunnerOptions {
  config: ReviewConfig;
  contextResolver: ReviewContextResolver;
  diffProvider: DiffProvider;
  projectContextProvider?: ProjectContextProvider;
  aiReviewClient: AiReviewClient;
  publishers: ReviewPublisher[];
  output: OutputWriter;
}

export class ReviewRunner {
  constructor(private readonly options: ReviewRunnerOptions) {}

  async run(input: ReviewContextInput): Promise<void> {
    const context = await this.options.contextResolver.resolve(input);
    const { name: profileName, profile } = resolveProfile(this.options.config, context.requestedProfile);
    const model = resolveModel(this.options.config, context.requestedModel);
    const rawDiff = await this.options.diffProvider.getDiff(context);

    if (!rawDiff?.trim()) {
      throw new Error("Pull request diff is empty or unavailable.");
    }

    const diff = truncateDiff(rawDiff, this.options.config.review.max_diff_bytes);
    const projectContext = this.options.projectContextProvider
      ? await this.options.projectContextProvider.getContext({ context, diff: diff.diff, profileName })
      : [];
    const rawResult = await this.options.aiReviewClient.review({
      config: this.options.config,
      profileName,
      profile,
      model,
      diff: diff.diff,
      projectContext
    });
    const result = filterFindings(rawResult, this.options.config.review);
    const publication = { context, result, model, profileName, diff, projectContext };

    for (const publisher of this.options.publishers) {
      await publisher.publish(publication);
    }

    this.options.output.write({
      model,
      profile: profileName,
      prNumber: context.prNumber,
      projectContextSources: projectContext.map((snippet) => snippet.source),
      ...result
    });
  }
}
