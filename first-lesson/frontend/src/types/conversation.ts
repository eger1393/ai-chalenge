export interface Conversation {
  id: string;
  title: string;
  model: string;
  systemPrompt?: string;
  projectId: string;
  temperature: number;
  maxTokens: number;
  repetitionPenalty: number;
  contextLimit: number;
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
  branchId?: string;
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

export interface ConversationBranch {
  id: string;
  name: string;
  parentBranchId?: string;
  checkpointMessageId?: string;
  checkpointId?: string;
  isActive: boolean;
  messageCount?: number;
  createdAt: string;
}

export interface Checkpoint {
  id: string;
  conversationId: string;
  messageId: string;
  label?: string;
  createdAt: string;
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
  branches?: ConversationBranch[];
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
  memoryLayers?: Array<{
    type: 'long_term' | 'working' | 'short_term';
    label: string;
    tokenCount: number;
    content?: string;
  }>;
  meta?: {
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
      model: string;
      promptTokens: number;
      completionTokens: number;
      cost: number;
      durationMs: number;
      validationPassed?: boolean;
      validationReason?: string;
      inputContext?: Array<{ role: string; content: string }>;
    }>;
  };
}
