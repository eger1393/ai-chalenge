import {
  IsOptional,
  IsNumber,
  IsInt,
  IsString,
  IsArray,
  IsIn,
  Min,
  Max,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';

export const ALLOWED_MODELS = ['gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4o'] as const;
export const DEFAULT_MODEL = 'gpt-4o-mini';

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
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  stop?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  systemPrompt?: string;
}
