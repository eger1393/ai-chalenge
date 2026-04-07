import { Module } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import { TokenService } from './token.service';

@Module({
  providers: [OpenAIService, TokenService],
  exports: [OpenAIService, TokenService],
})
export class AIModule {}
