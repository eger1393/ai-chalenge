import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;

  @IsOptional()
  params?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    repetitionPenalty?: number;
    systemPrompt?: string;
    contextLimit?: number;
    contextStrategy?: string;
  };
}
