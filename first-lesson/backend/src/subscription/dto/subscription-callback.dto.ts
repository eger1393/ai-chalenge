import {
  IsString,
  IsUUID,
  IsArray,
  IsNumber,
  IsOptional,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CallbackIssueDto {
  @IsNumber()
  number: number;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsString()
  url: string;

  @IsString()
  author: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @IsOptional()
  @IsString()
  created_at?: string;
}

export class SubscriptionCallbackDto {
  @IsString()
  subscription_id: string;

  @IsUUID()
  conversation_id: string;

  @IsUUID()
  user_id: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/, {
    message: 'Repository must be in format owner/repo',
  })
  repository: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CallbackIssueDto)
  issues: CallbackIssueDto[];
}
