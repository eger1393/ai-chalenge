import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Sse,
  UseGuards,
  Logger,
  UnauthorizedException,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { NotificationGatewayService } from './notification-gateway.service';

@Controller()
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly gateway: NotificationGatewayService,
    private readonly jwtService: JwtService,
  ) {}

  @Sse('notifications/stream')
  stream(@Req() req: Request): Observable<MessageEvent> {
    const token = req.query.token as string | undefined;
    if (!token) {
      throw new UnauthorizedException('Missing token query parameter');
    }

    let payload: { sub: string; username: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const userId = payload.sub;
    this.logger.log(`SSE stream opened for user ${userId}`);

    const stream$ = this.gateway.getOrCreateStream(userId);

    req.on('close', () => {
      this.logger.log(`SSE stream closed for user ${userId}`);
      this.gateway.removeStream(userId);
    });

    return stream$;
  }

  @Get('notifications')
  @UseGuards(JwtAuthGuard)
  async getHistory(
    @Query('conversationId') conversationId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const [notifications, unreadCount] = await Promise.all([
      this.notificationService.getHistory(conversationId, limit, offset),
      this.notificationService.getUnreadCount(conversationId),
    ]);

    return { notifications, unreadCount };
  }

  @Post('notifications/:id/read')
  @UseGuards(JwtAuthGuard)
  async markAsRead(@Param('id') id: string) {
    const notification = await this.notificationService.markAsRead(id);
    return { success: !!notification, notification };
  }

  @Post('notifications/read-all')
  @UseGuards(JwtAuthGuard)
  async markAllAsRead(@Query('conversationId') conversationId: string) {
    const updatedCount =
      await this.notificationService.markAllAsRead(conversationId);
    return { success: true, updatedCount };
  }
}
