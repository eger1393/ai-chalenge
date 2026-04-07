import { Module } from '@nestjs/common';
import { ConversationModule } from '../conversation/conversation.module';
import { AIModule } from '../ai/ai.module';
import { ContextController } from './context.controller';
import { ContextService } from './context.service';
import { ContextRepository } from './repositories/context.repository';
import { BranchRepository } from './repositories/branch.repository';
import { CheckpointRepository } from './repositories/checkpoint.repository';
import { SlidingWindowStrategy } from './strategies/sliding-window.strategy';
import { StickyFactsStrategy } from './strategies/sticky-facts.strategy';
import { BranchingStrategy } from './strategies/branching.strategy';

@Module({
  imports: [ConversationModule, AIModule],
  controllers: [ContextController],
  providers: [
    ContextService,
    ContextRepository,
    BranchRepository,
    CheckpointRepository,
    SlidingWindowStrategy,
    StickyFactsStrategy,
    BranchingStrategy,
  ],
  exports: [ContextService],
})
export class ContextModule {}
