import { Module, forwardRef } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConversationModule } from '../conversation/conversation.module';
import { TaskModule } from '../task/task.module';
import { UserProfileModule } from '../user-profile/user-profile.module';
import { TokenService } from './services/token.service';
import { OpenAIService } from './services/openai.service';
import { ContextStrategyService } from './services/context-strategy.service';
import { FactsService } from './services/facts.service';
import { BranchService } from './services/branch.service';
import { MemoryAssemblerService } from './services/memory-assembler.service';
import { SlidingWindowStrategy } from './strategies/sliding-window.strategy';
import { StickyFactsStrategy } from './strategies/sticky-facts.strategy';
import { BranchingStrategy } from './strategies/branching.strategy';

@Module({
  imports: [ConversationModule, forwardRef(() => TaskModule), forwardRef(() => UserProfileModule)],
  controllers: [ChatController],
  providers: [
    ChatService,
    TokenService,
    OpenAIService,
    ContextStrategyService,
    FactsService,
    BranchService,
    MemoryAssemblerService,
    SlidingWindowStrategy,
    StickyFactsStrategy,
    BranchingStrategy,
  ],
})
export class ChatModule {}
