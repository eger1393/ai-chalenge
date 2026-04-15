import { Controller, Post, Get, Body, Param, UseGuards, Request, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendMessageDto } from './dto/send-message.dto';
import { StepOrchestratorService } from './services/step-orchestrator.service';
import { MessageRepository } from '../conversation/repositories/message.repository';
import { ConversationService } from '../conversation/conversation.service';
import { StepRepository } from './repositories/step.repository';
import { RagRepository } from '../rag/rag.repository';

@Controller()
export class MessageController {
  private readonly logger = new Logger(MessageController.name);

  constructor(
    private readonly orchestrator: StepOrchestratorService,
    private readonly messageRepository: MessageRepository,
    private readonly conversationService: ConversationService,
    private readonly stepRepository: StepRepository,
    private readonly ragRepository: RagRepository,
  ) {}

  @Post('conversations/:id/messages')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async sendMessage(
    @Request() req: { user: { userId: string; username: string } },
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
      const userId = req.user.userId;

      // If params provided, update conversation params
      if (dto.params) {
        const updateData: Record<string, unknown> = {};
        if (dto.params.model) updateData.model = dto.params.model;
        if (dto.params.temperature != null) updateData.temperature = dto.params.temperature;
        if (dto.params.maxTokens != null) updateData.maxTokens = dto.params.maxTokens;
        if (dto.params.repetitionPenalty != null) updateData.repetitionPenalty = dto.params.repetitionPenalty;
        if (dto.params.systemPrompt != null) updateData.systemPrompt = dto.params.systemPrompt;
        if (dto.params.contextLimit != null) updateData.contextLimit = dto.params.contextLimit;
        if (dto.params.ragEnabled != null) updateData.ragEnabled = dto.params.ragEnabled;

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
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`SSE sendMessage failed: ${message}`, stack);
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
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`SSE resumeMessage failed: ${message}`, stack);
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

  @Get('messages/:id/debug')
  @UseGuards(JwtAuthGuard)
  async getMessageDebug(@Param('id') id: string) {
    const [meta, debug, steps] = await Promise.all([
      this.messageRepository.getMetaByMessageId(id),
      this.messageRepository.getDebugByMessageId(id),
      this.stepRepository.findByMessageId(id),
    ]);

    if (!debug && !meta && steps.length === 0) {
      return { error: 'Debug data not found' };
    }

    // Build pipeline data from steps
    const pipelineSteps = steps.map(s => ({
      stepType: s.stepType,
      status: s.status,
      content: s.outputResult ? (typeof s.outputResult === 'object' && (s.outputResult as Record<string, unknown>).text ? (s.outputResult as Record<string, unknown>).text : JSON.stringify(s.outputResult)) : '',
      attempt: s.attemptNumber,
      model: s.model || '',
      promptTokens: s.promptTokens,
      completionTokens: s.completionTokens,
      cost: s.cost,
      durationMs: s.durationMs,
      validationPassed: s.validationPassed,
      validationReason: s.validationReason,
      inputContext: Array.isArray(s.inputContext) ? s.inputContext : [],
      toolCalls: (typeof s.outputResult === 'object' && s.outputResult && Array.isArray((s.outputResult as Record<string, unknown>).toolCalls)) ? (s.outputResult as Record<string, unknown>).toolCalls : [],
    }));

    const totalCost = steps.reduce((sum, s) => sum + s.cost, 0);
    const totalTokens = steps.reduce((sum, s) => sum + s.promptTokens + s.completionTokens, 0);
    const totalAttempts = steps.length > 0 ? Math.max(...steps.map(s => s.attemptNumber)) : 0;
    const rag = await this.buildRagDebug(debug?.ragContext);

    return {
      strategyType: debug?.strategyType || 'pipeline',
      contextMessagesCount: debug?.contextMessagesCount || 0,
      contextMessagesAfterTruncation: debug?.contextMessagesAfterTruncation || 0,
      tokenBreakdown: debug?.tokenBreakdown || null,
      factsSnapshot: debug?.factsSnapshot || null,
      branchInfo: debug?.branchInfo || null,
      summaryInfo: debug?.summaryInfo || null,
      strategyMetadata: debug?.strategyMetadata || null,
      rag,
      memoryLayers: debug?.memoryLayers || null,
      meta: meta || null,
      pipelineData: {
        totalAttempts,
        totalCost,
        totalTokens,
        steps: pipelineSteps,
      },
    };
  }

  private async buildRagDebug(rawRagContext: unknown) {
    if (!isRecord(rawRagContext)) {
      return null;
    }

    const rawMatches = Array.isArray(rawRagContext.matches) ? rawRagContext.matches : [];
    const references = rawMatches
      .filter(isRecord)
      .map((match, index) => ({
        rank: asNumber(match.rank) ?? index + 1,
        chunkId: typeof match.chunkId === 'string' ? match.chunkId : '',
        documentId: typeof match.documentId === 'string' ? match.documentId : '',
        similarity: asNumber(match.similarity) ?? 0,
      }))
      .filter((match) => match.chunkId && match.documentId);

    const details = await this.ragRepository.getDebugChunkDetails(references.map((match) => match.chunkId));
    const detailsByChunkId = new Map(details.map((detail) => [detail.chunkId, detail]));

    return {
      enabled: Boolean(rawRagContext.enabled),
      matchCount: asNumber(rawRagContext.matchCount) ?? references.length,
      matches: references.map((reference) => {
        const detail = detailsByChunkId.get(reference.chunkId);
        return {
          ...reference,
          found: Boolean(detail),
          chunkIndex: detail?.chunkIndex ?? null,
          content: detail?.content ?? null,
          charCount: detail?.charCount ?? null,
          embeddingModel: detail?.embeddingModel ?? null,
          chunkMetadata: detail?.chunkMetadata ?? null,
          document: detail
            ? {
                id: detail.documentId,
                externalId: detail.externalId,
                sourceType: detail.sourceType,
                sourceKey: detail.sourceKey,
                publishedAt: detail.publishedAt?.toISOString() ?? null,
                fullText: detail.fullText,
                metadata: detail.documentMetadata,
              }
            : null,
        };
      }),
    };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
