import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { MessageDto } from './dto/message.dto';

@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post('message')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  sendMessage(@Body() dto: MessageDto) {
    return this.chatService.sendMessage(dto);
  }
}
