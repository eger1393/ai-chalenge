#!/usr/bin/env node
import { ReviewRunner } from "./application/review-runner.js";
import { parseArgs, printHelp } from "./cli/args.js";
import { YamlConfigLoader } from "./infrastructure/config/yaml-config-loader.js";
import { ProcessEnv } from "./infrastructure/env/process-env.js";
import { FallbackDiffProvider } from "./infrastructure/git/fallback-diff-provider.js";
import { LocalGitDiffProvider } from "./infrastructure/git/local-git-diff-provider.js";
import { GitHubApiClient } from "./infrastructure/github/github-api-client.js";
import { GitHubEventContextResolver } from "./infrastructure/github/github-event-context-resolver.js";
import { GitHubPullRequestDiffProvider } from "./infrastructure/github/github-pull-request-diff-provider.js";
import { GitHubReviewCommentPublisher } from "./infrastructure/github/github-review-comment-publisher.js";
import { GitHubStepSummaryPublisher } from "./infrastructure/github/github-step-summary-publisher.js";
import { LorexProjectContextProvider } from "./infrastructure/lorex/lorex-project-context-provider.js";
import { OpenAiReviewClient } from "./infrastructure/openai/openai-review-client.js";
import { ConsoleOutputWriter } from "./infrastructure/presentation/console-output-writer.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.command === "help" || args.command === "--help" || args.command === "-h") {
    printHelp();
    return;
  }

  if (args.command !== "review") {
    throw new Error(`Unknown command: ${args.command}`);
  }

  const env = new ProcessEnv();
  const loadedConfig = await new YamlConfigLoader().load(args.configPath);
  const githubToken = env.getOptional("GITHUB_TOKEN");
  const githubClient = githubToken ? new GitHubApiClient(githubToken) : undefined;
  const publishers = [new GitHubStepSummaryPublisher(env.getOptional("GITHUB_STEP_SUMMARY"))];

  if (!args.dryRun && loadedConfig.review.review.post_pr_comment) {
    if (!githubClient) {
      throw new Error("GITHUB_TOKEN is required to post PR review comment.");
    }

    publishers.push(new GitHubReviewCommentPublisher(githubClient));
  }

  const runner = new ReviewRunner({
    config: loadedConfig.review,
    contextResolver: new GitHubEventContextResolver(),
    diffProvider: new FallbackDiffProvider([
      new LocalGitDiffProvider(),
      new GitHubPullRequestDiffProvider(githubClient)
    ]),
    projectContextProvider: new LorexProjectContextProvider(loadedConfig.review.context.lorex),
    aiReviewClient: new OpenAiReviewClient({
      apiKey: env.getRequired(loadedConfig.provider.api_key_env),
      configPath: args.configPath
    }),
    publishers,
    output: new ConsoleOutputWriter()
  });

  await runner.run({
    eventPath: args.eventPath,
    repo: args.repo,
    model: args.model,
    profile: args.profile,
    prNumber: args.prNumber
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
