import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsIn(['auto', 'ru', 'en'])
  responseLanguage?: 'auto' | 'ru' | 'en';

  @IsOptional()
  @IsIn(['formal', 'friendly', 'technical', 'creative', 'yoda'])
  dialogueStyle?: 'formal' | 'friendly' | 'technical' | 'creative' | 'yoda';

  @IsOptional()
  @IsIn(['brief', 'detailed', 'unset'])
  responseBrevity?: 'brief' | 'detailed' | 'unset';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customPrompt?: string;
}
