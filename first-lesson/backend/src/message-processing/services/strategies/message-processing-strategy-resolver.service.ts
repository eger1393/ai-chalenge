import { Injectable } from '@nestjs/common';
import { type AIProvider } from '../../../ai/dto/ai-params.dto';
import { ContextService } from '../../../context/context.service';
import { type RagMode } from '../../../rag/constants';
import { RagService } from '../../../rag/rag.service';
import { RagContextResult } from '../../../rag/rag.types';
import { RagMessageProcessingStrategy } from './rag-message-processing.strategy';
import {
  MessageProcessingStrategy,
  ProcessingStrategyKind,
  StrategyResolution,
} from './message-processing-strategy.interface';
import { StandardMessageProcessingStrategy } from './standard-message-processing.strategy';

interface ResolveStrategyParams {
  ragEnabled: boolean;
  ragMode: RagMode;
  ragQueryRewriteEnabled: boolean;
  conversationId: string;
  userContent: string;
  userProvider: AIProvider;
  userModel: string;
}

@Injectable()
export class MessageProcessingStrategyResolverService {
  constructor(
    private readonly ragStrategy: RagMessageProcessingStrategy,
    private readonly standardStrategy: StandardMessageProcessingStrategy,
    private readonly ragService: RagService,
    private readonly contextService: ContextService,
  ) {}

  async resolve(params: ResolveStrategyParams): Promise<StrategyResolution> {
    const requestedKind: ProcessingStrategyKind = params.ragEnabled ? 'rag' : 'standard';

    if (!params.ragEnabled) {
      return {
        requestedKind,
        effectiveKind: 'standard',
        fallbackReason: null,
        ragResult: createEmptyRagResult(
          params.userContent,
          params.ragMode,
          params.ragQueryRewriteEnabled,
        ),
        strategy: this.standardStrategy,
      };
    }

    const retrievalHint = await this.contextService.buildRagRetrievalHint(params.conversationId);
    const ragResult = await this.ragService.buildContextBlock(
      params.userContent,
      params.userProvider,
      params.userModel,
      params.ragMode,
      params.ragQueryRewriteEnabled,
      retrievalHint,
    );

    if (ragResult.selectedCount === 0) {
      return {
        requestedKind,
        effectiveKind: 'standard',
        fallbackReason: 'empty_retrieval',
        ragResult,
        strategy: this.standardStrategy,
      };
    }

    return {
      requestedKind,
      effectiveKind: 'rag',
      fallbackReason: null,
      ragResult,
      ragEvidencePrompt: ragResult.block || undefined,
      strategy: this.ragStrategy,
    };
  }

  inferStrategyKindFromPlanning(planResult: string): ProcessingStrategyKind {
    return this.ragStrategy.canParsePlanningResult(planResult) ? 'rag' : 'standard';
  }
}

function createEmptyRagResult(
  query: string,
  mode: RagMode,
  queryRewriteEnabled: boolean,
): RagContextResult {
  const normalizedQuery = query.trim();
  return {
    block: '',
    mode,
    scoreType: mode === 'reranker' ? 'reranker' : 'heuristic',
    candidateCount: 0,
    selectedCount: 0,
    queryRewrite: {
      enabled: queryRewriteEnabled,
      applied: false,
      rawApplied: false,
      reason: null,
      originalQuery: normalizedQuery,
      rewrittenQuery: normalizedQuery,
      model: null,
    },
    retrievalHint: {
      applied: false,
      strategyType: null,
      text: '',
    },
    matches: [],
  };
}
