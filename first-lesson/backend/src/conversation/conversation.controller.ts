import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { MessageRepository } from './repositories/message.repository';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageRepository: MessageRepository,
  ) {}

  @Post()
  create(@Request() req, @Body() dto: CreateConversationDto) {
    return this.conversationService.create(req.user.userId, dto.projectId, dto);
  }

  @Get()
  findAll(@Request() req, @Query('projectId') projectId?: string) {
    return this.conversationService.findAll(req.user.userId, projectId);
  }

  @Get(':id')
  async findOne(
    @Request() req,
    @Param('id') id: string,
    @Query('includeStats') includeStats?: string,
  ) {
    const conversation = await this.conversationService.getConversationWithMessages(
      req.user.userId,
      id,
    );

    if (includeStats !== 'true') {
      return conversation;
    }

    const messages = await this.messageRepository.findByConversationId(id);
    return {
      ...conversation,
      uiStats: {
        messageCount: messages.length,
        hasLargeHistory: messages.length > 25,
      },
    };
  }

  @Patch(':id')
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationService.update(req.user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req, @Param('id') id: string) {
    return this.conversationService.remove(req.user.userId, id);
  }
}
