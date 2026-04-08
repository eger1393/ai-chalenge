import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionService } from './subscription.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post('subscriptions')
  create(@Request() req, @Body() dto: CreateSubscriptionDto) {
    return this.subscriptionService.create(req.user.userId, dto);
  }

  @Get('subscriptions')
  findAll(@Request() req) {
    return this.subscriptionService.findByUser(req.user.userId);
  }

  @Get('conversations/:id/subscriptions')
  findByConversation(@Param('id') id: string) {
    return this.subscriptionService.findByConversation(id);
  }
}
