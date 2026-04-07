import { Module } from '@nestjs/common';
import { ConversationModule } from '../conversation/conversation.module';
import { ContextModule } from '../context/context.module';
import { MemoryModule } from '../memory/memory.module';
import { AIModule } from '../ai/ai.module';
import { ProjectModule } from '../project/project.module';
import { MessageController } from './message.controller';
import { StepOrchestratorService } from './services/step-orchestrator.service';
import { StepRunnerService } from './services/step-runner.service';
import { GuardService } from './services/guard.service';
import { StepRepository } from './repositories/step.repository';

@Module({
  imports: [ConversationModule, ContextModule, MemoryModule, AIModule, ProjectModule],
  controllers: [MessageController],
  providers: [
    StepOrchestratorService,
    StepRunnerService,
    GuardService,
    StepRepository,
  ],
  exports: [StepOrchestratorService],
})
export class MessageProcessingModule {}
