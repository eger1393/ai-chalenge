'use client';

import { useState } from 'react';
import { Flag, Bug } from 'lucide-react';
import { AppliedParams, Usage } from '@/types/ai-params';
import { MessageDebugData } from '@/types/conversation';
import { AppliedParamsDisplay } from './applied-params-display';
import { DebugPanel } from './debug-panel';
import { getMessageDebug } from '@/lib/api';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  appliedParams?: AppliedParams;
  cost?: number;
  usage?: Usage;
  durationMs?: number;
  truncation?: { droppedMessages: number; droppedTokens: number };
  contextUsedTokens?: number;
  contextMaxTokens?: number;
  onCreateCheckpoint?: (messageId: string) => void;
  showCheckpointButton?: boolean;
  messageId?: string;
  debugData?: MessageDebugData;
}

export function MessageBubble({ role, content, error, appliedParams, cost, usage, durationMs, truncation, contextUsedTokens, contextMaxTokens, onCreateCheckpoint, showCheckpointButton, messageId, debugData }: MessageBubbleProps) {
  const [debugData2, setDebugData2] = useState<MessageDebugData | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const handleToggleDebug = async () => {
    if (showDebug) {
      setShowDebug(false);
      return;
    }
    setShowDebug(true);
    if (!debugData2 && !debugData && messageId) {
      setDebugLoading(true);
      try {
        const envelopeId = messageId.replace(/-assistant$/, '').replace(/-user$/, '');
        const data = await getMessageDebug(envelopeId);
        setDebugData2(data);
      } catch (e) {
        console.error('Failed to load debug data', e);
      } finally {
        setDebugLoading(false);
      }
    }
  };

  if (role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[70%] px-4 py-3 text-white rounded-2xl rounded-tr-sm text-sm leading-relaxed bg-indigo-600">
          {content}
        </div>
      </div>
    );
  }

  const effectiveDebugData = debugData || debugData2;

  return (
    <div className="group/msg mb-4">
      {truncation && truncation.droppedMessages > 0 && (
        <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 mb-1 ml-11">
          Контекст обрезан: удалено {truncation.droppedMessages} сообщ. (~{truncation.droppedTokens} tok)
        </div>
      )}
      <AppliedParamsDisplay appliedParams={appliedParams} cost={cost} usage={usage} durationMs={durationMs} contextUsedTokens={contextUsedTokens} contextMaxTokens={contextMaxTokens} />
      <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
        </svg>
      </div>
      <div className="max-w-[70%]">
        <div
          className={`px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap ${
            error
              ? 'bg-red-50 text-red-600 border border-red-200'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {content}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {showCheckpointButton && onCreateCheckpoint && messageId && (
            <button
              type="button"
              onClick={() => onCreateCheckpoint(messageId)}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-indigo-600 opacity-0 group-hover/msg:opacity-100 transition-all"
              title="Создать checkpoint от этого сообщения"
            >
              <Flag className="w-3 h-3" />
              Checkpoint
            </button>
          )}
          {messageId && (
            <button
              type="button"
              onClick={handleToggleDebug}
              className={`flex items-center gap-1 text-[10px] transition-all ${
                showDebug
                  ? 'text-indigo-600'
                  : 'text-gray-400 hover:text-indigo-600 opacity-0 group-hover/msg:opacity-100'
              }`}
              title="Показать debug данные"
            >
              <Bug className="w-3 h-3" />
              Debug
            </button>
          )}
        </div>
      </div>
      </div>
      {showDebug && effectiveDebugData && <DebugPanel debugData={effectiveDebugData} />}
      {showDebug && debugLoading && !effectiveDebugData && (
        <div className="ml-11 mt-1.5 text-[11px] text-gray-400">Загрузка debug данных...</div>
      )}
      {showDebug && !debugLoading && !effectiveDebugData && (
        <div className="ml-11 mt-1.5 text-[11px] text-gray-400">Debug данные недоступны</div>
      )}
    </div>
  );
}
