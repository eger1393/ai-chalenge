import { Module } from '@nestjs/common';
import { ProjectModule } from '../project/project.module';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { ConversationRepository } from './repositories/conversation.repository';
import { MessageRepository } from './repositories/message.repository';

@Module({
  imports: [ProjectModule],
  providers: [ConversationService, ConversationRepository, MessageRepository],
  controllers: [ConversationController],
  exports: [ConversationService, MessageRepository],
})
export class ConversationModule {}
