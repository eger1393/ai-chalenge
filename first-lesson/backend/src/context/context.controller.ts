import {
  Controller,
  Get,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContextService } from './context.service';
import { ConversationService } from '../conversation/conversation.service';
import { UpdateContextDto } from './dto/update-context.dto';
import { SetFactDto } from './dto/set-fact.dto';

@Controller('conversations/:id')
@UseGuards(JwtAuthGuard)
export class ContextController {
  constructor(
    private readonly contextService: ContextService,
    private readonly conversationService: ConversationService,
  ) {}

  // ── Context ──

  @Get('context')
  async getContext(
    @Request() req: { user: { userId: string } },
    @Param('id') conversationId: string,
  ) {
    await this.conversationService.findOne(req.user.userId, conversationId);
    const ctx = await this.contextService.getContext(conversationId);
    if (!ctx) {
      throw new NotFoundException('Context not found for this conversation');
    }
    return ctx;
  }

  @Patch('context')
  async updateStrategy(
    @Request() req: { user: { userId: string } },
    @Param('id') conversationId: string,
    @Body() dto: UpdateContextDto,
  ) {
    await this.conversationService.findOne(req.user.userId, conversationId);
    if (dto.strategyType) {
      await this.contextService.updateStrategy(
        conversationId,
        dto.strategyType,
        dto.strategyData,
      );
    }
    return { success: true };
  }

  // ── Facts ──

  @Get('facts')
  async getFacts(
    @Request() req: { user: { userId: string } },
    @Param('id') conversationId: string,
  ) {
    await this.conversationService.findOne(req.user.userId, conversationId);
    return this.contextService.getFacts(conversationId);
  }

  @Put('facts')
  async setFact(
    @Request() req: { user: { userId: string } },
    @Param('id') conversationId: string,
    @Body() dto: SetFactDto,
  ) {
    await this.conversationService.findOne(req.user.userId, conversationId);
    await this.contextService.setFact(conversationId, dto.key, dto.value);
    return { success: true };
  }

  @Delete('facts/:key')
  async deleteFact(
    @Request() req: { user: { userId: string } },
    @Param('id') conversationId: string,
    @Param('key') key: string,
  ) {
    await this.conversationService.findOne(req.user.userId, conversationId);
    await this.contextService.deleteFact(conversationId, key);
    return { success: true };
  }
}
