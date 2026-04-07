import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsUUID()
  checkpointMessageId?: string;
}
