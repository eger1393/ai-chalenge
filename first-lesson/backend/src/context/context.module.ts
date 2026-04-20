import { Module } from '@nestjs/common';
import { ConversationModule } from '../conversation/conversation.module';
import { AIModule } from '../ai/ai.module';
import { ContextController } from './context.controller';
import { ContextService } from './context.service';
import { ContextRepository } from './repositories/context.repository';
import { SlidingWindowStrategy } from './strategies/sliding-window.strategy';
import { StickyFactsStrategy } from './strategies/sticky-facts.strategy';

@Module({
  imports: [ConversationModule, AIModule],
  controllers: [ContextController],
  providers: [
    ContextService,
    ContextRepository,
    SlidingWindowStrategy,
    StickyFactsStrategy,
  ],
  exports: [ContextService],
})
export class ContextModule {}
