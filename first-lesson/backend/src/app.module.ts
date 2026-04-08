import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UserProfileModule } from './user-profile/user-profile.module';
import { ProjectModule } from './project/project.module';
import { ConversationModule } from './conversation/conversation.module';
import { ContextModule } from './context/context.module';
import { AIModule } from './ai/ai.module';
import { MemoryModule } from './memory/memory.module';
import { MessageProcessingModule } from './message-processing/message-processing.module';
import { McpModule } from './mcp/mcp.module';
import { NotificationModule } from './notification/notification.module';
import { SubscriptionModule } from './subscription/subscription.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL || '60000'),
        limit: parseInt(process.env.THROTTLE_LIMIT || '20'),
      },
    ]),
    DatabaseModule,
    McpModule,
    AuthModule,
    UserProfileModule,
    ProjectModule,
    ConversationModule,
    ContextModule,
    AIModule,
    MemoryModule,
    MessageProcessingModule,
    NotificationModule,
    SubscriptionModule,
  ],
})
export class AppModule {}
