import { IsString, IsOptional, MaxLength, IsIn } from 'class-validator';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['active', 'completed', 'archived'])
  status?: 'active' | 'completed' | 'archived';
}
