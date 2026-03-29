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
    @Body() body: { name: string; checkpointMessageId: string },
  ) {
    return this.branchService.createBranch(id, body.name, body.checkpointMessageId);
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
    return this.branchService.getMessagesForBranch(id, branchId);
  }
}
