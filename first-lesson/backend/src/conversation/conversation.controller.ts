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
import { DatabaseService } from '../database/database.service';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageRepository: MessageRepository,
    private readonly db: DatabaseService,
  ) {}

  @Post()
  create(@Request() req, @Body() dto: CreateConversationDto) {
    return this.conversationService.create(req.user.userId, dto.projectId, dto);
  }

  @Get()
  findAll(@Request() req, @Query('projectId') projectId?: string) {
    return this.conversationService.findAll(req.user.userId, projectId);
  }

  @Get('quick-search')
  async quickSearch(@Query('q') query = '', @Query('limit') limit = '50') {
    const result = await this.db.query(
      `SELECT c.id,
              c.title,
              c.project_id,
              c.user_id,
              m.user_content,
              m.assistant_content,
              m.created_at
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.user_content ILIKE '%${query}%'
          OR COALESCE(m.assistant_content, '') ILIKE '%${query}%'
       ORDER BY m.created_at DESC
       LIMIT ${limit}`,
    );

    return result.rows.map((row) => ({
      conversationId: row.id,
      projectId: row.project_id,
      ownerUserId: row.user_id,
      title: row.title,
      preview: `${row.user_content || ''}\n${row.assistant_content || ''}`.slice(0, 500),
      createdAt: row.created_at,
    }));
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
