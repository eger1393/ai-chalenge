import { Controller, Post, Get, Body, Param, UseGuards, Request, Res, Logger, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendMessageDto } from './dto/send-message.dto';
import { StepOrchestratorService } from './services/step-orchestrator.service';
import { MessageRepository } from '../conversation/repositories/message.repository';
import { ConversationService } from '../conversation/conversation.service';
import { StepRepository } from './repositories/step.repository';
import { RagRepository } from '../rag/rag.repository';
import { normalizeRagMode } from '../rag/constants';
import { ContextService } from '../context/context.service';

@Controller()
export class MessageController {
  private readonly logger = new Logger(MessageController.name);

  constructor(
    private readonly orchestrator: StepOrchestratorService,
    private readonly messageRepository: MessageRepository,
    private readonly conversationService: ConversationService,
    private readonly stepRepository: StepRepository,
    private readonly ragRepository: RagRepository,
    private readonly contextService: ContextService,
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
      const conversation = await this.conversationService.findOne(userId, conversationId);

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
        if (dto.params.ragQueryRewriteEnabled != null) updateData.ragQueryRewriteEnabled = dto.params.ragQueryRewriteEnabled;
        if (dto.params.ragMode != null) updateData.ragMode = dto.params.ragMode;

        if (Object.keys(updateData).length > 0) {
          await this.conversationService.updateParams(conversationId, updateData as Parameters<ConversationService['updateParams']>[1]);
        }

        if (dto.params.contextStrategy) {
          const existingContext = await this.contextService.getContext(conversationId);
          if (existingContext) {
            await this.contextService.updateStrategy(conversationId, dto.params.contextStrategy);
          } else {
            await this.contextService.createContext(conversationId, dto.params.contextStrategy);
          }
        }
      }

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
  async pauseMessage(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    await this.requireOwnedMessage(req.user.userId, id);
    await this.orchestrator.pauseMessage(id);
    return { status: 'paused' };
  }

  @Post('messages/:id/resume')
  @UseGuards(JwtAuthGuard)
  async resumeMessage(
    @Request() req: { user: { userId: string } },
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
      await this.requireOwnedMessage(req.user.userId, id);
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
  async cancelMessage(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    await this.requireOwnedMessage(req.user.userId, id);
    await this.orchestrator.cancelMessage(id);
    return { status: 'cancelled' };
  }

  @Get('messages/:id/debug')
  @UseGuards(JwtAuthGuard)
  async getMessageDebug(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    await this.requireOwnedMessage(req.user.userId, id);
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

  private async requireOwnedMessage(userId: string, messageId: string) {
    const message = await this.messageRepository.findOwnedById(messageId, userId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    return message;
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
        rankingScore: asNumber(match.rankingScore) ?? null,
        tokenOverlapCount: asNumber(match.tokenOverlapCount) ?? null,
        rerankerScore: asNumber(match.rerankerScore) ?? null,
      }))
      .filter((match) => match.chunkId && match.documentId);

    const details = await this.ragRepository.getDebugChunkDetails(references.map((match) => match.chunkId));
    const detailsByChunkId = new Map(details.map((detail) => [detail.chunkId, detail]));

    return {
      enabled: Boolean(rawRagContext.enabled),
      mode: normalizeRagMode(rawRagContext.mode),
      scoreType: rawRagContext.scoreType === 'reranker' ? 'reranker' : 'heuristic',
      candidateCount: asNumber(rawRagContext.candidateCount) ?? references.length,
      matchCount: asNumber(rawRagContext.matchCount) ?? references.length,
      selectedCount:
        asNumber(rawRagContext.selectedCount) ??
        asNumber(rawRagContext.matchCount) ??
        references.length,
      queryRewrite: mapQueryRewrite(rawRagContext.queryRewrite),
      retrievalHint: mapRetrievalHint(rawRagContext.retrievalHint),
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
  async getMessage(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    const message = await this.requireOwnedMessage(req.user.userId, id);

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

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function mapQueryRewrite(value: unknown) {
  if (!isRecord(value)) {
    return {
      enabled: false,
      applied: false,
      originalQuery: '',
      rewrittenQuery: '',
      model: null,
    };
  }

  return {
    enabled: Boolean(value.enabled),
    applied: Boolean(value.applied),
    rawApplied: Boolean(value.rawApplied),
    reason: asRewriteReason(value.reason),
    originalQuery: asString(value.originalQuery) ?? '',
    rewrittenQuery: asString(value.rewrittenQuery) ?? '',
    model: asString(value.model),
  };
}

function mapRetrievalHint(value: unknown) {
  if (!isRecord(value)) {
    return {
      applied: false,
      strategyType: null,
      text: '',
    };
  }

  return {
    applied: Boolean(value.applied),
    strategyType: asString(value.strategyType),
    text: asString(value.text) ?? '',
  };
}

function asRewriteReason(value: unknown) {
  switch (value) {
    case 'normalized_colloquial':
    case 'canonicalized_entity':
    case 'clarified_intent':
    case 'already_search_friendly':
    case 'ambiguous_without_context':
      return value;
    default:
      return null;
  }
}
