import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { ConversationModule } from '../conversation/conversation.module';
import { NotificationModule } from '../notification/notification.module';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionCallbackController } from './subscription-callback.controller';
import { SubscriptionService } from './subscription.service';

@Module({
  imports: [AIModule, NotificationModule, ConversationModule],
  controllers: [SubscriptionController, SubscriptionCallbackController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
