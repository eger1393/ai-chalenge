export interface Conversation {
  id: string;
  title: string;
  provider: string;
  model: string;
  systemPrompt?: string;
  projectId: string;
  temperature: number;
  maxTokens: number;
  repetitionPenalty: number;
  contextLimit: number;
  ragEnabled: boolean;
  ragQueryRewriteEnabled: boolean;
  ragMode: 'filter' | 'reranker';
  contextStrategy?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage?: {
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
  };
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  userContent: string;
  assistantContent?: string;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'cancelled' | 'paused';
  currentStep?: string;
  attemptNumber: number;
  maxAttempts: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageMeta {
  id: string;
  messageId: string;
  appliedProvider?: string;
  appliedModel?: string;
  appliedTemperature?: number;
  appliedMaxTokens?: number;
  appliedRepetitionPenalty?: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  durationMs: number;
  contextUsedTokens: number;
  contextMaxTokens: number;
  truncatedMessages: number;
  truncatedTokens: number;
}

export interface MessageDebug {
  id: string;
  messageId: string;
  strategyType?: string;
  contextMessagesCount: number;
  contextMessagesAfterTruncation: number;
  tokenBreakdown?: any;
  factsSnapshot?: any;
  branchInfo?: any;
  summaryInfo?: any;
  strategyMetadata?: any;
  memoryLayers?: any;
}

export interface ConversationFact {
  key: string;
  value: string;
  updatedAt?: string;
}

export interface ConversationTotals {
  totalMessages: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCost: number;
}

export interface ConversationDetail extends Conversation {
  messages: ConversationMessage[];
  conversationTotals?: ConversationTotals;
  facts?: ConversationFact[];
}

export interface ContextWindow {
  model: string;
  maxTokens: number;
  usedTokens: number;
  usagePercent: number;
}

export interface MessageDebugData {
  strategyType: string;
  contextMessagesCount: number;
  contextMessagesAfterTruncation: number;
  tokenBreakdown?: Record<string, unknown>;
  factsSnapshot?: Array<{ key: string; value: string }>;
  factsAfter?: Array<{ key: string; value: string }>;
  branchInfo?: unknown;
  summaryInfo?: unknown;
  strategyMetadata?: Record<string, unknown>;
  rag?: {
    enabled: boolean;
    mode: 'filter' | 'reranker';
    scoreType: 'heuristic' | 'reranker';
    candidateCount: number;
    matchCount: number;
    selectedCount: number;
    queryRewrite: {
      enabled: boolean;
      applied: boolean;
      rawApplied: boolean;
      reason?: 'normalized_colloquial' | 'canonicalized_entity' | 'clarified_intent' | 'already_search_friendly' | 'ambiguous_without_context' | null;
      originalQuery: string;
      rewrittenQuery: string;
      model?: string | null;
    };
    retrievalHint: {
      applied: boolean;
      strategyType?: string | null;
      text: string;
    };
    matches: Array<{
      rank: number;
      chunkId: string;
      documentId: string;
      similarity: number;
      rankingScore?: number | null;
      tokenOverlapCount?: number | null;
      rerankerScore?: number | null;
      found: boolean;
      chunkIndex?: number | null;
      content?: string | null;
      charCount?: number | null;
      embeddingModel?: string | null;
      chunkMetadata?: Record<string, unknown> | null;
      document?: {
        id: string;
        externalId: string;
        sourceType: string;
        sourceKey: string;
        publishedAt?: string | null;
        fullText: string;
        metadata: Record<string, unknown>;
      } | null;
    }>;
  } | null;
  memoryLayers?: Array<{
    type: 'long_term' | 'working' | 'short_term';
    label: string;
    tokenCount: number;
    content?: string;
  }>;
  meta?: {
    appliedProvider?: string;
    appliedModel?: string;
    appliedTemperature?: number;
    appliedMaxTokens?: number;
    appliedRepetitionPenalty?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cost?: number;
    durationMs?: number;
    contextUsedTokens?: number;
    contextMaxTokens?: number;
    truncatedMessages?: number;
    truncatedTokens?: number;
  };
  pipelineData?: {
    totalAttempts: number;
    totalCost: number;
    totalTokens: number;
      steps: Array<{
        stepType: string;
        status: string;
      content: string;
      attempt: number;
      provider?: string;
      model: string;
      promptTokens: number;
      completionTokens: number;
      cost: number;
      durationMs: number;
      validationPassed?: boolean;
      validationReason?: string;
      inputContext?: Array<{ role: string; content: string }>;
      toolCalls?: Array<{
        name: string;
        arguments: string;
        result: string;
        server?: string;
        displayName?: string;
      }>;
    }>;
  };
}
