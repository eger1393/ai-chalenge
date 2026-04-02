import { IsString, IsNotEmpty, MaxLength, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AIParamsDto } from './ai-params.dto';

export class PipelineMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;

  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AIParamsDto)
  params?: AIParamsDto;
}
