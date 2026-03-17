'use client';

import { Plus, X, RotateCcw } from 'lucide-react';
import { AIParams } from '@/types/ai-params';

interface AIParamsPanelProps {
  params: AIParams;
  setParam: <K extends keyof AIParams>(key: K, value: AIParams[K]) => void;
  resetParams: () => void;
  hasNonDefaults: boolean;
}

export function AIParamsPanel({ params, setParam, resetParams, hasNonDefaults }: AIParamsPanelProps) {
  return (
    <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        {/* Temperature */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-gray-700">Temperature</label>
            <span className="text-xs font-mono text-gray-500">{params.temperature.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={params.temperature}
            onChange={(e) => setParam('temperature', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>0</span>
            <span>1</span>
            <span>2</span>
          </div>
        </div>

        {/* Max Tokens */}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1.5">Max Tokens</label>
          <input
            type="number"
            min={1}
            max={4096}
            value={params.maxTokens}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 1 && v <= 4096) {
                setParam('maxTokens', v);
              }
            }}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Stop Sequences */}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1.5">
            Stop sequences ({params.stop.length}/4)
          </label>
          <div className="space-y-1.5">
            {params.stop.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={s}
                  maxLength={64}
                  onChange={(e) => {
                    const next = [...params.stop];
                    next[i] = e.target.value;
                    setParam('stop', next);
                  }}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = params.stop.filter((_, idx) => idx !== i);
                    setParam('stop', next);
                  }}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Удалить stop sequence"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          {params.stop.length < 4 && (
            <button
              type="button"
              onClick={() => setParam('stop', [...params.stop, ''])}
              className="mt-1.5 flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Добавить
            </button>
          )}
        </div>

        {/* System Prompt */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-gray-700">System Prompt</label>
            <span className="text-[10px] text-gray-400">
              {params.systemPrompt.length}/4000
            </span>
          </div>
          <textarea
            value={params.systemPrompt}
            maxLength={4000}
            onChange={(e) => setParam('systemPrompt', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Инструкции для модели..."
          />
        </div>

        {/* Reset */}
        {hasNonDefaults && (
          <button
            type="button"
            onClick={resetParams}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Сбросить к значениям по умолчанию
          </button>
        )}
      </div>
    </div>
  );
}
