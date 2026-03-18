'use client';

import { X, RotateCcw } from 'lucide-react';
import { AIParams, AVAILABLE_MODELS, MODEL_LABELS, ConsiliumParams, Role } from '@/types/ai-params';
import { ConsiliumPanel } from './consilium-panel';

interface AIParamsPanelProps {
  params: AIParams;
  setParam: <K extends keyof AIParams>(key: K, value: AIParams[K]) => void;
  resetParams: () => void;
  hasNonDefaults: boolean;
  onClose?: () => void;
  consilium: ConsiliumParams;
  roles: Role[];
  toggleConsilium: () => void;
  setExpert: (index: number, field: 'name' | 'systemPrompt' | 'mode' | 'roleId', value: string) => void;
  setExpertRole: (index: number, roleId: string, roleName: string) => void;
  addExpert: () => void;
  removeExpert: (index: number) => void;
}

export function AIParamsPanel({ params, setParam, resetParams, hasNonDefaults, onClose, consilium, roles, toggleConsilium, setExpert, setExpertRole, addExpert, removeExpert }: AIParamsPanelProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-900">Параметры AI</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Закрыть панель параметров"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Model */}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Модель</label>
          <p className="text-[10px] text-gray-400 mb-1.5">Выбор модели GigaChat. Бесплатная — базовая модель без подписки.</p>
          <select
            value={params.model}
            onChange={(e) => setParam('model', e.target.value)}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m} value={m}>
                {MODEL_LABELS[m] ?? m}
              </option>
            ))}
          </select>
        </div>

        {/* Temperature */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-700">Температура</label>
            <span className="text-xs font-mono text-gray-500">{params.temperature.toFixed(1)}</span>
          </div>
          <p className="text-[10px] text-gray-400 mb-1.5">Чем выше — тем более креативные ответы. 0 — детерминированный, 2 — максимальная случайность.</p>
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
          <label className="text-xs font-medium text-gray-700 block mb-1">Макс. токенов</label>
          <p className="text-[10px] text-gray-400 mb-1.5">Максимальная длина ответа в токенах. 1 токен ≈ 1 слово.</p>
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

        {/* Repetition Penalty */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-700">Штраф за повторы</label>
            <span className="text-xs font-mono text-gray-500">{params.repetitionPenalty.toFixed(1)}</span>
          </div>
          <p className="text-[10px] text-gray-400 mb-1.5">Снижает повторения в ответе. 1.0 — без штрафа, выше — меньше повторов.</p>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={params.repetitionPenalty}
            onChange={(e) => setParam('repetitionPenalty', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>0</span>
            <span>1</span>
            <span>2</span>
          </div>
        </div>

        {/* System Prompt — hidden when consilium is active */}
        {!consilium.enabled && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">Системный промпт</label>
              <span className="text-[10px] text-gray-400">
                {params.systemPrompt.length}/4000
              </span>
            </div>
            <p className="text-[10px] text-gray-400 mb-1.5">Инструкции для модели: формат ответа, роль, стиль, ограничения.</p>
            <textarea
              value={params.systemPrompt}
              maxLength={4000}
              onChange={(e) => setParam('systemPrompt', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Инструкции для модели..."
            />
          </div>
        )}

        {/* Consilium */}
        <div className="border-t border-gray-200 pt-4">
          <ConsiliumPanel
            consilium={consilium}
            roles={roles}
            toggleConsilium={toggleConsilium}
            setExpert={setExpert}
            setExpertRole={setExpertRole}
            addExpert={addExpert}
            removeExpert={removeExpert}
          />
        </div>

        {/* Reset */}
        <button
          type="button"
          onClick={resetParams}
          className={`flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-opacity ${hasNonDefaults ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <RotateCcw className="w-3 h-3" />
          Сбросить к значениям по умолчанию
        </button>
      </div>
    </div>
  );
}
