import { resolveModel, type ReviewConfig } from "../domain/config.js";
import type { ReviewContext } from "../domain/review-context.js";
import type {
  AiIssueAnswerClient,
  CodeContextProvider,
  IssueAnswerContextInput,
  IssueAnswerContextResolver,
  IssueAnswerPublisher,
  OutputWriter,
  ProjectContextProvider
} from "./ports.js";

export interface IssueAnswerRunnerOptions {
  config: ReviewConfig;
  contextResolver: IssueAnswerContextResolver;
  projectContextProvider?: ProjectContextProvider;
  codeContextProvider: CodeContextProvider;
  aiIssueAnswerClient: AiIssueAnswerClient;
  publishers: IssueAnswerPublisher[];
  output: OutputWriter;
}

export class IssueAnswerRunner {
  constructor(private readonly options: IssueAnswerRunnerOptions) {}

  async run(input: IssueAnswerContextInput): Promise<void> {
    if (!this.options.config.issue_answer) {
      throw new Error("issue_answer config is required for answer-issue command.");
    }

    const issue = await this.options.contextResolver.resolve(input);
    if (issue.isPullRequest) {
      this.options.output.write({ skipped: true, reason: "Issue is a pull request." });
      return;
    }

    const model = resolveModel(this.options.config, input.model ?? issue.requestedModel);
    const projectContext = this.options.projectContextProvider
      ? await this.options.projectContextProvider.getContext({
        context: toReviewContext(issue),
        diff: "",
        profileName: "issue-answer",
        query: buildIssueLorexQuery(issue.title, issue.body)
      })
      : [];
    const codeContext = await this.options.codeContextProvider.getContext({
      issue,
      maxFiles: this.options.config.issue_answer.max_code_files,
      maxBytes: this.options.config.issue_answer.max_code_bytes
    });
    const result = await this.options.aiIssueAnswerClient.answer({
      config: this.options.config,
      promptPath: this.options.config.issue_answer.prompt,
      model,
      issue,
      projectContext,
      codeContext
    });
    const publication = { issue, result, model, projectContext, codeContext };

    for (const publisher of this.options.publishers) {
      await publisher.publish(publication);
    }

    this.options.output.write({
      model,
      issueNumber: issue.issueNumber,
      projectContextSources: projectContext.map((snippet) => snippet.source),
      codeContextSources: codeContext.map((snippet) => snippet.source),
      ...result
    });
  }
}

function toReviewContext(issue: Awaited<ReturnType<IssueAnswerContextResolver["resolve"]>>): ReviewContext {
  return {
    repo: issue.repo,
    owner: issue.owner,
    name: issue.name,
    eventName: issue.eventName,
    issueNumber: issue.issueNumber,
    requestedModel: issue.requestedModel,
    labels: issue.labels
  };
}

function buildIssueLorexQuery(title: string, body: string): string {
  return [
    "Найди релевантную проектную документацию, AGENTS.md, PROJECT_MAP.md, архитектурные правила и контракты для ответа на GitHub issue.",
    "Вопрос пользователя:",
    title,
    body,
    "Нужны источники, которые объясняют поведение проекта и указывают на связанные модули кода."
  ].join("\n");
}
