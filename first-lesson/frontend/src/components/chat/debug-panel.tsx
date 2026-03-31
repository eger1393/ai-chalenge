'use client';

import { useState } from 'react';
import { Bug, ChevronDown, ChevronRight } from 'lucide-react';
import { MessageDebugData } from '@/types/conversation';

interface DebugPanelProps {
  debugData: MessageDebugData;
}

const STRATEGY_LABELS: Record<string, string> = {
  sliding_window: 'Окно',
  sticky_facts: 'Факты',
  branching: 'Ветки',
};

const LAYER_CONFIG = {
  long_term: { label: 'long-term', emoji: '🧠', bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  working: { label: 'working', emoji: '📋', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  short_term: { label: 'short-term', emoji: '💬', bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200' },
};

export function DebugPanel({ debugData }: DebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set());

  const toggleLayer = (i: number) => {
    setExpandedLayers(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  return (
    <div className="ml-11 mt-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-indigo-600 transition-colors"
      >
        <Bug className="w-3 h-3" />
        Debug
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>

      {open && (
        <div className="border border-gray-200 rounded-lg bg-gray-50 p-3 text-[10px] mt-1 space-y-0 max-w-lg">
          {/* Memory Layers */}
          {debugData.memoryLayers && debugData.memoryLayers.length > 0 && (
            <div className="mb-2 pb-2 border-b border-gray-200">
              <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Слои памяти (system prompt)</div>
              <div className="space-y-1.5">
                {debugData.memoryLayers.map((layer, i) => {
                  const cfg = LAYER_CONFIG[layer.type];
                  const isExpanded = expandedLayers.has(i);
                  return (
                    <div key={i} className={`rounded border ${cfg.border} ${cfg.bg}`}>
                      <button
                        type="button"
                        onClick={() => layer.content && toggleLayer(i)}
                        className={`w-full flex items-center gap-2 px-2 py-1 ${layer.content ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${cfg.bg} ${cfg.text}`}>
                          {cfg.emoji} {cfg.label}
                        </span>
                        <span className={`text-[10px] font-mono ${cfg.text}`}>{layer.tokenCount} tok</span>
                        <span className={`text-[10px] ${cfg.text} truncate flex-1 text-left`}>{layer.label}</span>
                        {layer.content && (isExpanded ? <ChevronDown className={`w-3 h-3 ${cfg.text} flex-shrink-0`} /> : <ChevronRight className={`w-3 h-3 ${cfg.text} flex-shrink-0`} />)}
                      </button>
                      {isExpanded && layer.content && (
                        <div className={`px-2 pb-2 text-[10px] font-mono ${cfg.text} whitespace-pre-wrap break-words border-t ${cfg.border} pt-1 mt-0`}>
                          {layer.content}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Strategy + Context composition */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">Стратегия:</span>
              <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
                {STRATEGY_LABELS[debugData.strategyType] || debugData.strategyType || '—'}
              </span>
            </div>
            {(debugData.contextMessagesCount > 0 || debugData.contextMessagesAfterTruncation > 0) && (
              <div className="flex items-center gap-1">
                <span className="text-gray-500">Контекст:</span>
                <span className="font-mono text-gray-700">
                  {debugData.contextMessagesCount} → {debugData.contextMessagesAfterTruncation} сообщ.
                </span>
                {debugData.contextMessagesCount > debugData.contextMessagesAfterTruncation && (
                  <span className="text-red-400 font-mono">
                    (-{debugData.contextMessagesCount - debugData.contextMessagesAfterTruncation})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Token Breakdown */}
          {debugData.tokenBreakdown && Object.keys(debugData.tokenBreakdown).length > 0 && (
            <div className="border-t border-gray-100 pt-2 mt-2">
              <div className="text-gray-500 mb-1">Токены:</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(debugData.tokenBreakdown).map(([key, val]) => (
                  <span key={key} className="font-mono text-gray-600">
                    <span className="text-gray-400">{key}:</span> {val}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Facts: before and after */}
          {debugData.strategyType === 'sticky_facts' && (
            <div className="border-t border-gray-100 pt-2 mt-2">
              <div className="text-gray-500 mb-1">Факты в контексте (до ответа):</div>
              {debugData.factsSnapshot && debugData.factsSnapshot.length > 0 ? (
                <div className="space-y-0.5 mb-2">
                  {debugData.factsSnapshot.map((fact, i) => (
                    <div key={i} className="font-mono text-gray-700">
                      <span className="text-teal-600">{fact.key}</span>: {fact.value}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-400 mb-2">(пусто)</div>
              )}

              {debugData.factsAfter && (
                <>
                  <div className="text-gray-500 mb-1">Факты после извлечения:</div>
                  {debugData.factsAfter.length > 0 ? (
                    <div className="space-y-0.5 mb-2">
                      {debugData.factsAfter.map((fact, i) => (
                        <div key={i} className="font-mono text-gray-700">
                          <span className="text-emerald-600">{fact.key}</span>: {fact.value}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-400 mb-2">(пусто)</div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Strategy Metadata */}
          {debugData.strategyMetadata && Object.keys(debugData.strategyMetadata).length > 0 && (
            <div className="border-t border-gray-100 pt-2 mt-2">
              <div className="text-gray-500 mb-1">Strategy Details:</div>
              <table className="font-mono text-[10px]">
                <tbody>
                  {Object.entries(debugData.strategyMetadata)
                    .filter(([key]) => key !== 'factsSnapshot')
                    .map(([key, val]) => (
                    <tr key={key}>
                      <td className="pr-3 text-gray-500">{key}</td>
                      <td className="text-gray-700">{typeof val === 'object' ? JSON.stringify(val) : String(val)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
