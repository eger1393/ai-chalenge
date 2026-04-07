import { IsOptional, IsString, IsIn, IsObject } from 'class-validator';

export class UpdateContextDto {
  @IsOptional()
  @IsString()
  @IsIn(['sliding_window', 'sticky_facts', 'branching'])
  strategyType?: string;

  @IsOptional()
  @IsObject()
  strategyData?: Record<string, unknown>;
}
