import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { ALLOWED_RAG_MODES } from '../../rag/constants';

export class CreateConversationDto {
  @IsUUID()
  @IsNotEmpty()
  projectId: string;

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
  @IsBoolean()
  ragQueryRewriteEnabled?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_RAG_MODES as unknown as string[])
  ragMode?: string;

  @IsOptional()
  @IsString()
  contextStrategy?: string;
}
