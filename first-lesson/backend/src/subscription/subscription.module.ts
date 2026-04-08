import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { NotificationModule } from '../notification/notification.module';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { SubscriptionPollerService } from './subscription-poller.service';

@Module({
  imports: [AIModule, NotificationModule],
  controllers: [SubscriptionController],
  providers: [
    SubscriptionService,
    SubscriptionRepository,
    SubscriptionPollerService,
  ],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
