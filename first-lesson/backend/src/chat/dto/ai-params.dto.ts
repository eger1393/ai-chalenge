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

export const ALLOWED_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4.1'] as const;
export const DEFAULT_MODEL = 'gpt-4o-mini';

// Pricing per 1M tokens in USD
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1': { input: 2.00, output: 8.00 },
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
  @Max(4096)
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
}
