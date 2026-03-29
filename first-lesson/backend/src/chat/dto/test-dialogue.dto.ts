import { IsString, IsNotEmpty, MaxLength, IsOptional, IsInt, Min, Max, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { AIParamsDto, ALLOWED_MODELS } from './ai-params.dto';

export class TestDialogueDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  topic: string;

  @IsInt()
  @Min(5)
  @Max(50)
  pairsCount: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => AIParamsDto)
  params?: AIParamsDto;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_MODELS as unknown as string[])
  simulatorModel?: string;
}
