import { IsOptional, IsString, MaxLength, IsIn } from 'class-validator';
import { ALLOWED_MODELS } from '../../chat/dto/ai-params.dto';

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_MODELS as unknown as string[])
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  systemPrompt?: string;
}
