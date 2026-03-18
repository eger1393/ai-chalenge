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

export const ALLOWED_MODELS = ['GigaChat', 'GigaChat-Plus', 'GigaChat-Pro'] as const;
export const DEFAULT_MODEL = 'GigaChat';

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
