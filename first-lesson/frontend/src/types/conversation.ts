import { Usage } from './ai-params';

export interface Conversation {
  id: string;
  title: string;
  model: string;
  systemPrompt?: string;
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
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  cost?: number;
  isConsilium?: boolean;
  createdAt: string;
  expertOpinions?: Array<{ expert: string; reply: string; error?: boolean }>;
  usage?: Usage;
  durationMs?: number;
  tokenCount?: number;
  promptTokens?: number;
  completionTokens?: number;
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
}

export interface ContextWindow {
  model: string;
  maxTokens: number;
  usedTokens: number;
  usagePercent: number;
}
