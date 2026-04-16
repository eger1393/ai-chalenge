import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { ALLOWED_RAG_MODES } from '../../rag/constants';

export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  title?: string;

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
  @IsString()
  @IsIn(ALLOWED_RAG_MODES as unknown as string[])
  ragMode?: string;
}
