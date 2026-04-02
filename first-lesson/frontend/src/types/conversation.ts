import { Usage } from './ai-params';

export interface Conversation {
  id: string;
  title: string;
  model: string;
  systemPrompt?: string;
  contextStrategy?: string;
  taskId?: string;
  isTest?: boolean;
  testTopic?: string;
  testPairsTarget?: number;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage?: {
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
  };
}

export interface MemoryLayerInfo {
  type: 'long_term' | 'working' | 'short_term';
  label: string;
  tokenCount: number;
  content?: string;
}

export interface MessageDebugData {
  strategyType: string;
  contextMessagesCount: number;
  contextMessagesAfterTruncation: number;
  factsSnapshot?: Array<{ key: string; value: string }>;
  factsAfter?: Array<{ key: string; value: string }>;
  branchInfo?: Record<string, unknown>;
  summaryInfo?: Record<string, unknown>;
  tokenBreakdown?: Record<string, number>;
  strategyMetadata?: Record<string, unknown>;
  memoryLayers?: MemoryLayerInfo[];
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

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  cost?: number;
  branchId?: string;
  createdAt: string;
  usage?: Usage;
  durationMs?: number;
  tokenCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  currentMessageTokens?: number;
  historyTokens?: number;
  appliedModel?: string;
  appliedTemperature?: number;
  appliedMaxTokens?: number;
  contextUsedTokens?: number;
  contextMaxTokens?: number;
  truncatedMessages?: number;
  truncatedTokens?: number;
  debugData?: MessageDebugData;
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
