import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { MessageDto } from './dto/message.dto';
import { ConsiliumMessageDto } from './dto/consilium.dto';
import { EXPERT_ROLES } from './constants/expert-roles';

@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post('message')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  sendMessage(@Request() req, @Body() dto: MessageDto) {
    return this.chatService.sendMessage(dto, req.user.username);
  }

  @Get('roles')
  @UseGuards(JwtAuthGuard)
  getRoles() {
    return EXPERT_ROLES.map(({ id, name }) => ({ id, name }));
  }

  @Post('consilium')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  consilium(@Request() req, @Body() dto: ConsiliumMessageDto) {
    return this.chatService.sendConsilium(dto, req.user.username);
  }
}
