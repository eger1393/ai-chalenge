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
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateConversationDto) {
    return this.conversationService.create(
      req.user.username,
      dto.title,
      dto.model,
      dto.systemPrompt,
      dto.contextStrategy,
      dto.isTest,
      dto.testTopic,
    );
  }

  @Get()
  findAll(@Request() req, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100) : 10;
    return this.conversationService.findAll(req.user.username, parsedLimit);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.conversationService.findOne(req.user.username, id);
  }

  @Patch(':id')
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationService.update(req.user.username, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req, @Param('id') id: string) {
    return this.conversationService.remove(req.user.username, id);
  }

  @Patch(':id/task')
  async setTask(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { taskId: string | null },
  ) {
    const conversation = await this.conversationService.findOne(req.user.username, id);
    if (!conversation) throw new NotFoundException('Conversation not found');
    await this.conversationService.setTaskId(id, body.taskId ?? null);
    return { success: true };
  }
}
