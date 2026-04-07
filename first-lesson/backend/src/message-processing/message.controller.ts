import { Controller, Post, Get, Body, Param, UseGuards, Request, Res } from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendMessageDto } from './dto/send-message.dto';
import { StepOrchestratorService } from './services/step-orchestrator.service';
import { MessageRepository } from '../conversation/repositories/message.repository';
import { ConversationService } from '../conversation/conversation.service';
import { StepRepository } from './repositories/step.repository';

@Controller()
export class MessageController {
  constructor(
    private readonly orchestrator: StepOrchestratorService,
    private readonly messageRepository: MessageRepository,
    private readonly conversationService: ConversationService,
    private readonly stepRepository: StepRepository,
  ) {}

  @Post('conversations/:id/messages')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async sendMessage(
    @Request() req: { user: { sub: string } },
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const onEvent = (event: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const userId = req.user.sub;

      // If params provided, update conversation params
      if (dto.params) {
        const updateData: Record<string, unknown> = {};
        if (dto.params.model) updateData.model = dto.params.model;
        if (dto.params.temperature != null) updateData.temperature = dto.params.temperature;
        if (dto.params.maxTokens != null) updateData.maxTokens = dto.params.maxTokens;
        if (dto.params.repetitionPenalty != null) updateData.repetitionPenalty = dto.params.repetitionPenalty;
        if (dto.params.systemPrompt != null) updateData.systemPrompt = dto.params.systemPrompt;
        if (dto.params.contextLimit != null) updateData.contextLimit = dto.params.contextLimit;

        if (Object.keys(updateData).length > 0) {
          await this.conversationService.updateParams(conversationId, updateData as Parameters<ConversationService['updateParams']>[1]);
        }
      }

      // Load conversation to get projectId
      const conversation = await this.conversationService.findOne(userId, conversationId);

      // Create message envelope
      const envelope = await this.messageRepository.createEnvelope(
        conversationId,
        dto.message,
      );

      // Process the message
      await this.orchestrator.processMessage({
        messageId: envelope.id,
        conversationId,
        userId,
        projectId: conversation.projectId || undefined,
        onEvent,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
    } finally {
      res.end();
    }
  }

  @Post('messages/:id/pause')
  @UseGuards(JwtAuthGuard)
  async pauseMessage(@Param('id') id: string) {
    await this.orchestrator.pauseMessage(id);
    return { status: 'paused' };
  }

  @Post('messages/:id/resume')
  @UseGuards(JwtAuthGuard)
  async resumeMessage(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const onEvent = (event: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await this.orchestrator.resumeMessage(id, onEvent);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
    } finally {
      res.end();
    }
  }

  @Post('messages/:id/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelMessage(@Param('id') id: string) {
    await this.orchestrator.cancelMessage(id);
    return { status: 'cancelled' };
  }

  @Get('messages/:id')
  @UseGuards(JwtAuthGuard)
  async getMessage(@Param('id') id: string) {
    const message = await this.messageRepository.findById(id);
    if (!message) {
      return { error: 'Message not found' };
    }

    const steps = await this.stepRepository.findByMessageId(id);

    return {
      id: message.id,
      conversationId: message.conversationId,
      branchId: message.branchId,
      userContent: message.userContent,
      assistantContent: message.assistantContent,
      status: message.status,
      currentStep: message.currentStep,
      attemptNumber: message.attemptNumber,
      maxAttempts: message.maxAttempts,
      errorMessage: message.errorMessage,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      steps: steps.map((s) => ({
        id: s.id,
        stepType: s.stepType,
        attemptNumber: s.attemptNumber,
        status: s.status,
        model: s.model,
        promptTokens: s.promptTokens,
        completionTokens: s.completionTokens,
        cost: s.cost,
        durationMs: s.durationMs,
        validationPassed: s.validationPassed,
        validationReason: s.validationReason,
        createdAt: s.createdAt,
        completedAt: s.completedAt,
      })),
    };
  }
}
