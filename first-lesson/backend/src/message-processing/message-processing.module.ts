import { Module } from '@nestjs/common';
import { ConversationModule } from '../conversation/conversation.module';
import { ContextModule } from '../context/context.module';
import { MemoryModule } from '../memory/memory.module';
import { AIModule } from '../ai/ai.module';
import { ProjectModule } from '../project/project.module';
import { RagModule } from '../rag/rag.module';
import { MessageController } from './message.controller';
import { StepOrchestratorService } from './services/step-orchestrator.service';
import { StepRunnerService } from './services/step-runner.service';
import { GuardService } from './services/guard.service';
import { StepRepository } from './repositories/step.repository';
import { StandardMessageProcessingStrategy } from './services/strategies/standard-message-processing.strategy';
import { RagMessageProcessingStrategy } from './services/strategies/rag-message-processing.strategy';
import { MessageProcessingStrategyResolverService } from './services/strategies/message-processing-strategy-resolver.service';

@Module({
  imports: [ConversationModule, ContextModule, MemoryModule, AIModule, ProjectModule, RagModule],
  controllers: [MessageController],
  providers: [
    StepOrchestratorService,
    StepRunnerService,
    GuardService,
    StepRepository,
    StandardMessageProcessingStrategy,
    RagMessageProcessingStrategy,
    MessageProcessingStrategyResolverService,
  ],
  exports: [StepOrchestratorService],
})
export class MessageProcessingModule {}
