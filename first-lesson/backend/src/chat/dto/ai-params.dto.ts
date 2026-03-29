import {
  IsOptional,
  IsNumber,
  IsInt,
  IsString,
  IsIn,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export const ALLOWED_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-5.4', 'gpt-5.4-mini'] as const;
export const DEFAULT_MODEL = 'gpt-4o-mini';

// Pricing per 1M tokens in USD (short context, non-cached)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1': { input: 2.00, output: 8.00 },
  'gpt-5.4': { input: 2.50, output: 15.00 },
  'gpt-5.4-mini': { input: 0.75, output: 4.50 },
};

// Context window sizes per model (in tokens)
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o-mini': 128000,
  'gpt-4o': 128000,
  'gpt-4.1-nano': 1048576,
  'gpt-4.1-mini': 1048576,
  'gpt-4.1': 1048576,
};

export class AIParamsDto {
  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_MODELS as unknown as string[])
  model?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32768)
  maxTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  repetitionPenalty?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  systemPrompt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1048576)
  contextLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  summaryMode?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(100)
  summaryKeepLast?: number;

  @IsOptional()
  @IsString()
  @IsIn(['sliding_window', 'sticky_facts', 'branching'])
  contextStrategy?: string;

  @IsOptional()
  strategyParams?: Record<string, unknown>;
}
