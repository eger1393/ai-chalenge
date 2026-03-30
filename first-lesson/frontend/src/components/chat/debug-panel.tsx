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

export function DebugPanel({ debugData }: DebugPanelProps) {
  const [open, setOpen] = useState(false);

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
        <div className="border border-gray-200 rounded-lg bg-gray-50 p-3 text-[10px] mt-1 space-y-0">
          {/* Strategy badge */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Стратегия:</span>
            <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
              {STRATEGY_LABELS[debugData.strategyType] || debugData.strategyType}
            </span>
          </div>

          {/* Context messages */}
          <div className="border-t border-gray-100 pt-2 mt-2">
            <span className="text-gray-500">Контекст: </span>
            <span className="font-mono text-gray-700">
              {debugData.contextMessagesCount} &rarr; {debugData.contextMessagesAfterTruncation} сообщений
            </span>
          </div>

          {/* Token Breakdown */}
          {debugData.tokenBreakdown && Object.keys(debugData.tokenBreakdown).length > 0 && (
            <div className="border-t border-gray-100 pt-2 mt-2">
              <div className="text-gray-500 mb-1">Token Breakdown:</div>
              <table className="font-mono text-[10px]">
                <tbody>
                  {Object.entries(debugData.tokenBreakdown).map(([key, val]) => (
                    <tr key={key}>
                      <td className="pr-3 text-gray-500 capitalize">{key}</td>
                      <td className="text-gray-700">{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Facts: before and after */}
          {debugData.strategyType === 'sticky_facts' && (
            <div className="border-t border-gray-100 pt-2 mt-2">
              {/* Facts before (sent to AI) */}
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

              {/* Facts after (extracted from response) */}
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
                    .filter(([key]) => key !== 'factsSnapshot') // shown above
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
