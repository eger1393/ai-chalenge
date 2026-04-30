import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { isSeverity } from "../../domain/review.js";
import type { IssueAnswerConfig, LoadedConfig, ProviderConfig, ReviewConfig, ReviewProfile } from "../../domain/config.js";
import type { ProjectContextConfig } from "../../domain/project-context.js";

interface RawConfig {
  provider?: ProviderConfig;
  defaults?: ReviewConfig["defaults"];
  model_aliases?: Record<string, string>;
  profiles?: Record<string, Partial<ReviewProfile>>;
  review?: ReviewConfig["review"];
  context?: ProjectContextConfig;
  issue_answer?: Partial<IssueAnswerConfig>;
}

export class YamlConfigLoader {
  async load(configPath: string): Promise<LoadedConfig> {
    const absolutePath = path.resolve(configPath);
    const raw = YAML.parse(await readFile(absolutePath, "utf8")) as RawConfig;
    validateRawConfig(raw, absolutePath);

    return {
      provider: raw.provider,
      review: {
        defaults: raw.defaults,
        model_aliases: raw.model_aliases ?? {},
        profiles: normalizeProfiles(raw.profiles),
        review: raw.review,
        context: normalizeContext(raw.context),
        issue_answer: normalizeIssueAnswer(raw.issue_answer)
      }
    };
  }
}

function validateRawConfig(config: RawConfig, configPath: string): asserts config is Required<Pick<RawConfig, "provider" | "defaults" | "profiles" | "review">> & RawConfig {
  if (config.provider?.type !== "openai") {
    throw new Error(`${configPath}: provider.type must be "openai"`);
  }
  if (!config.provider.api_key_env) {
    throw new Error(`${configPath}: provider.api_key_env is required`);
  }
  if (!config.defaults?.model) {
    throw new Error(`${configPath}: defaults.model is required`);
  }
  if (typeof config.defaults.temperature !== "number") {
    throw new Error(`${configPath}: defaults.temperature is required`);
  }
  if (typeof config.defaults.max_tokens !== "number") {
    throw new Error(`${configPath}: defaults.max_tokens is required`);
  }
  if (!config.profiles || Object.keys(config.profiles).length === 0) {
    throw new Error(`${configPath}: at least one profile is required`);
  }
  if (!config.review || !isSeverity(config.review.severity_threshold)) {
    throw new Error(`${configPath}: review.severity_threshold is invalid`);
  }
  if (typeof config.review.max_diff_bytes !== "number" || config.review.max_diff_bytes <= 0) {
    throw new Error(`${configPath}: review.max_diff_bytes must be a positive number`);
  }
  if (typeof config.review.max_comments !== "number" || config.review.max_comments < 0) {
    throw new Error(`${configPath}: review.max_comments must be a non-negative number`);
  }
  if (typeof config.review.post_pr_comment !== "boolean") {
    throw new Error(`${configPath}: review.post_pr_comment must be a boolean`);
  }
}

function normalizeContext(context: ProjectContextConfig | undefined): ProjectContextConfig {
  if (!context?.lorex) {
    return {};
  }

  const lorex = context.lorex;
  if (typeof lorex.enabled !== "boolean") {
    throw new Error("context.lorex.enabled must be a boolean");
  }
  if (!lorex.project_root) {
    throw new Error("context.lorex.project_root is required");
  }
  if (!lorex.cli_path) {
    throw new Error("context.lorex.cli_path is required");
  }
  if (!Number.isInteger(lorex.max_chunks) || lorex.max_chunks <= 0) {
    throw new Error("context.lorex.max_chunks must be a positive integer");
  }
  if (!Number.isInteger(lorex.max_bytes) || lorex.max_bytes <= 0) {
    throw new Error("context.lorex.max_bytes must be a positive integer");
  }

  return { lorex };
}

function normalizeProfiles(profiles: Record<string, Partial<ReviewProfile>>): Record<string, ReviewProfile> {
  return Object.fromEntries(Object.entries(profiles).map(([name, profile]) => {
    if (!profile.prompt) {
      throw new Error(`Profile ${name} must define prompt`);
    }

    return [name, {
      prompt: profile.prompt,
      tools: profile.tools ?? []
    }];
  }));
}

function normalizeIssueAnswer(config: Partial<IssueAnswerConfig> | undefined): IssueAnswerConfig | undefined {
  if (!config) {
    return undefined;
  }
  if (!config.prompt) {
    throw new Error("issue_answer.prompt is required");
  }
  if (typeof config.post_issue_comment !== "boolean") {
    throw new Error("issue_answer.post_issue_comment must be a boolean");
  }
  const maxCodeFiles = config.max_code_files;
  if (!Number.isInteger(maxCodeFiles) || !maxCodeFiles || maxCodeFiles <= 0) {
    throw new Error("issue_answer.max_code_files must be a positive integer");
  }
  const maxCodeBytes = config.max_code_bytes;
  if (!Number.isInteger(maxCodeBytes) || !maxCodeBytes || maxCodeBytes <= 0) {
    throw new Error("issue_answer.max_code_bytes must be a positive integer");
  }

  return config as IssueAnswerConfig;
}
