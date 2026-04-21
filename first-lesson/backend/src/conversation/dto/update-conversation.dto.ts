import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { ALLOWED_PROVIDERS } from '../../ai/dto/ai-params.dto';
import { ALLOWED_RAG_MODES } from '../../rag/constants';

export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_PROVIDERS as unknown as string[])
  provider?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsNumber()
  maxTokens?: number;

  @IsOptional()
  @IsNumber()
  repetitionPenalty?: number;

  @IsOptional()
  @IsNumber()
  contextLimit?: number;

  @IsOptional()
  @IsBoolean()
  ragEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  ragQueryRewriteEnabled?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_RAG_MODES as unknown as string[])
  ragMode?: string;
}
