import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ALLOWED_RAG_MODES } from '../../rag/constants';

class SendMessageParamsDto {
  @IsOptional()
  @IsString()
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
  @Min(-2)
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
  @IsIn(['sliding_window', 'sticky_facts'])
  contextStrategy?: string;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SendMessageParamsDto)
  params?: SendMessageParamsDto;
}
