import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationRepository } from './repositories/notification.repository';
import { NotificationGatewayService } from './notification-gateway.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'default-secret',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationRepository,
    NotificationGatewayService,
  ],
  exports: [NotificationService, NotificationGatewayService],
})
export class NotificationModule {}
