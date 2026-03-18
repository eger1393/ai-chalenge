'use client';

import { X, Plus } from 'lucide-react';
import { ConsiliumParams } from '@/types/ai-params';

interface ConsiliumPanelProps {
  consilium: ConsiliumParams;
  toggleConsilium: () => void;
  setExpert: (index: number, field: 'name' | 'systemPrompt', value: string) => void;
  addExpert: () => void;
  removeExpert: (index: number) => void;
}

export function ConsiliumPanel({
  consilium,
  toggleConsilium,
  setExpert,
  addExpert,
  removeExpert,
}: ConsiliumPanelProps) {
  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-medium text-gray-700">Режим Консилиум</label>
          <p className="text-[10px] text-gray-400">
            Несколько экспертов отвечают параллельно, затем синтез.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleConsilium}
          className={`relative w-9 h-5 rounded-full transition-colors ${
            consilium.enabled ? 'bg-indigo-600' : 'bg-gray-300'
          }`}
          role="switch"
          aria-checked={consilium.enabled}
          aria-label="Включить режим Консилиум"
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              consilium.enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Experts */}
      {consilium.enabled && (
        <div className="space-y-3">
          {consilium.experts.map((expert, index) => (
            <div
              key={index}
              className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={expert.name}
                  onChange={(e) => setExpert(index, 'name', e.target.value)}
                  className="text-xs font-medium text-gray-700 bg-transparent border-none outline-none focus:ring-0 p-0 w-full"
                  placeholder="Имя эксперта"
                  maxLength={30}
                />
                {consilium.experts.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeExpert(index)}
                    className="p-0.5 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                    aria-label={`Удалить ${expert.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <textarea
                value={expert.systemPrompt}
                onChange={(e) => setExpert(index, 'systemPrompt', e.target.value)}
                rows={2}
                maxLength={2000}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Системный промпт эксперта..."
              />
              <div className="text-right text-[10px] text-gray-400">
                {expert.systemPrompt.length}/2000
              </div>
            </div>
          ))}

          {consilium.experts.length < 3 && (
            <button
              type="button"
              onClick={addExpert}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Добавить эксперта
            </button>
          )}

          {consilium.experts.filter((e) => e.systemPrompt.trim()).length < 2 && (
            <p className="text-[10px] text-amber-600">
              Заполните системный промпт минимум у 2 экспертов для работы консилиума.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
