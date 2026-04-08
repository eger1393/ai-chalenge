import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionService } from './subscription.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('subscriptions')
  findAll(@Query('conversationId') conversationId: string, @Request() req: { user: { userId: string } }) {
    if (conversationId) {
      return this.subscriptionService.findByConversation(conversationId);
    }
    return this.subscriptionService.findByUser(req.user.userId);
  }

  @Get('conversations/:id/subscriptions')
  findByConversation(@Param('id') id: string) {
    return this.subscriptionService.findByConversation(id);
  }
}
