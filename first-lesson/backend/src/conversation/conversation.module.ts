import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { ConversationRepository } from './repositories/conversation.repository';
import { MessageRepository } from './repositories/message.repository';

@Module({
  providers: [ConversationService, ConversationRepository, MessageRepository],
  controllers: [ConversationController],
  exports: [ConversationService, MessageRepository],
})
export class ConversationModule {}
