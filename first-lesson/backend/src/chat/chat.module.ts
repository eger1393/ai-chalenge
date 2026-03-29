import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConversationModule } from '../conversation/conversation.module';
import { TokenService } from './services/token.service';
import { OpenAIService } from './services/openai.service';
import { ContextStrategyService } from './services/context-strategy.service';
import { FactsService } from './services/facts.service';
import { BranchService } from './services/branch.service';
import { SlidingWindowStrategy } from './strategies/sliding-window.strategy';
import { StickyFactsStrategy } from './strategies/sticky-facts.strategy';
import { BranchingStrategy } from './strategies/branching.strategy';

@Module({
  imports: [ConversationModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    TokenService,
    OpenAIService,
    ContextStrategyService,
    FactsService,
    BranchService,
    SlidingWindowStrategy,
    StickyFactsStrategy,
    BranchingStrategy,
  ],
})
export class ChatModule {}
