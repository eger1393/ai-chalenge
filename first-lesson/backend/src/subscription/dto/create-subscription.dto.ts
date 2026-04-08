import { IsString, IsUUID, Matches } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/, {
    message: 'Repository must be in format owner/repo',
  })
  repository: string;

  @IsUUID()
  conversationId: string;
}
