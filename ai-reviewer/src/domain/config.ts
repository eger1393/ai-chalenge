import type { ReviewPolicy } from "./review.js";
import type { ProjectContextConfig } from "./project-context.js";

export interface ReviewProfile {
  prompt: string;
  tools: string[];
}

export interface ModelDefaults {
  model: string;
  temperature: number;
  max_tokens: number;
}

export interface ReviewConfig {
  defaults: ModelDefaults;
  model_aliases: Record<string, string>;
  profiles: Record<string, ReviewProfile>;
  review: ReviewPolicy;
  context: ProjectContextConfig;
}

export interface ProviderConfig {
  type: "openai";
  api_key_env: string;
}

export interface LoadedConfig {
  provider: ProviderConfig;
  review: ReviewConfig;
}

export function resolveProfile(config: ReviewConfig, requested?: string): { name: string; profile: ReviewProfile } {
  const name = requested || "default";
  const profile = config.profiles[name];

  if (!profile) {
    throw new Error(`Unknown review profile: ${name}`);
  }

  return { name, profile };
}

export function resolveModel(config: ReviewConfig, requested?: string): string {
  const model = requested || config.defaults.model;
  return config.model_aliases[model] ?? model;
}
