import {
  IsOptional,
  IsNumber,
  IsInt,
  IsString,
  IsArray,
  Min,
  Max,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';

export class AIParamsDto {
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
