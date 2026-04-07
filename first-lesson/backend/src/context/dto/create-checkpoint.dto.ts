import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateCheckpointDto {
  @IsUUID()
  messageId!: string;

  @IsOptional()
  @IsString()
  label?: string;
}
