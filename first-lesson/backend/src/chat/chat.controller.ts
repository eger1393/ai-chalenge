import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Request, Res } from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { MessageDto } from './dto/message.dto';
import { TestDialogueDto } from './dto/test-dialogue.dto';
import { ConsiliumMessageDto } from './dto/consilium.dto';
import { EXPERT_ROLES } from './constants/expert-roles';
import { FactsService } from './services/facts.service';
import { BranchService } from './services/branch.service';

@Controller('chat')
export class ChatController {
  constructor(
    private chatService: ChatService,
    private factsService: FactsService,
    private branchService: BranchService,
  ) {}

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

  @Post('test-dialogue')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async testDialogue(@Request() req, @Body() dto: TestDialogueDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const onEvent = (event: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await this.chatService.generateTestDialogue(dto, req.user.username, onEvent);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    } finally {
      res.end();
    }
  }

  // --- Facts endpoints ---

  @Get('conversations/:id/facts')
  @UseGuards(JwtAuthGuard)
  async getFacts(@Param('id') id: string) {
    const facts = await this.factsService.getFacts(id);
    return facts.map(f => ({
      key: f.fact_key,
      value: f.fact_value,
      updatedAt: f.updated_at,
    }));
  }

  @Put('conversations/:id/facts')
  @UseGuards(JwtAuthGuard)
  async setFact(@Param('id') id: string, @Body() body: { key: string; value: string }) {
    const fact = await this.factsService.setFact(id, body.key, body.value);
    return { key: fact.fact_key, value: fact.fact_value, updatedAt: fact.updated_at };
  }

  @Delete('conversations/:id/facts/:key')
  @UseGuards(JwtAuthGuard)
  async deleteFact(@Param('id') id: string, @Param('key') key: string) {
    const deleted = await this.factsService.deleteFact(id, key);
    return { deleted };
  }

  // --- Checkpoint endpoints ---

  @Post('conversations/:id/checkpoints')
  @UseGuards(JwtAuthGuard)
  async createCheckpoint(
    @Param('id') id: string,
    @Body() body: { messageId: string; label?: string },
  ) {
    return this.branchService.createCheckpoint(id, body.messageId, body.label);
  }

  @Get('conversations/:id/checkpoints')
  @UseGuards(JwtAuthGuard)
  async getCheckpoints(@Param('id') id: string) {
    return this.branchService.getCheckpoints(id);
  }

  // --- Branch endpoints ---

  @Get('conversations/:id/branches')
  @UseGuards(JwtAuthGuard)
  async getBranches(@Param('id') id: string) {
    return this.branchService.getBranches(id);
  }

  @Post('conversations/:id/branches')
  @UseGuards(JwtAuthGuard)
  async createBranch(
    @Param('id') id: string,
    @Body() body: { checkpointId: string; name: string },
  ) {
    return this.branchService.createBranch(id, body.checkpointId, body.name);
  }

  @Post('conversations/:id/branches/:branchId/activate')
  @UseGuards(JwtAuthGuard)
  async activateBranch(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
  ) {
    await this.branchService.activateBranch(id, branchId);
    return { activated: branchId };
  }

  @Delete('conversations/:id/branches/:branchId')
  @UseGuards(JwtAuthGuard)
  async deleteBranch(@Param('branchId') branchId: string) {
    await this.branchService.deleteBranch(branchId);
    return { deleted: true };
  }

  @Get('conversations/:id/branches/:branchId/messages')
  @UseGuards(JwtAuthGuard)
  async getBranchMessages(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
  ) {
    const messages = await this.branchService.getMessagesForBranch(id, branchId);
    // Return in the same format as conversation detail messages
    return messages.map((m: Record<string, unknown>) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      model: m.model || undefined,
      cost: m.cost || undefined,
      isConsilium: m.is_consilium || false,
      branchId: m.branch_id || undefined,
      createdAt: m.created_at,
      durationMs: m.duration_ms || undefined,
      currentMessageTokens: m.current_message_tokens || undefined,
      historyTokens: m.history_tokens || undefined,
      appliedModel: m.applied_model || undefined,
      appliedTemperature: m.applied_temperature != null ? parseFloat(String(m.applied_temperature)) : undefined,
      appliedMaxTokens: m.applied_max_tokens || undefined,
      contextUsedTokens: m.context_used_tokens || undefined,
      contextMaxTokens: m.context_max_tokens || undefined,
      truncatedMessages: m.truncated_messages || undefined,
      truncatedTokens: m.truncated_tokens || undefined,
      promptTokens: m.prompt_tokens || undefined,
      completionTokens: m.completion_tokens || undefined,
      tokenCount: m.token_count || undefined,
    }));
  }
}
