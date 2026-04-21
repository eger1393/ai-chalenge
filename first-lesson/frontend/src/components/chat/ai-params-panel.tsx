'use client';

import { X, RotateCcw } from 'lucide-react';
import {
  AIParams,
  AVAILABLE_PROVIDERS,
  AVAILABLE_MODELS,
  getDefaultModelForProvider,
  MODELS_BY_PROVIDER,
  MODEL_LABELS,
  MODEL_CONTEXT_SIZES,
  PROVIDER_LABELS,
  STRATEGY_LABELS,
  ContextStrategyType,
  RAG_MODE_LABELS,
} from '@/types/ai-params';
import { StrategySelector } from './strategy-selector';

interface AIParamsPanelProps {
  params: AIParams;
  setParam: <K extends keyof AIParams>(key: K, value: AIParams[K]) => void;
  resetParams: () => void;
  hasNonDefaults: boolean;
  onClose?: () => void;
  contextStrategyValue: ContextStrategyType;
  isContextStrategyLocked?: boolean;
  onChangeContextStrategy: (value: ContextStrategyType) => void;
}

export function AIParamsPanel({
  params,
  setParam,
  resetParams,
  hasNonDefaults,
  onClose,
  contextStrategyValue,
  isContextStrategyLocked = false,
  onChangeContextStrategy,
}: AIParamsPanelProps) {
  const availableModels = MODELS_BY_PROVIDER[params.provider] || AVAILABLE_MODELS;

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
          <label className="text-xs font-medium text-gray-700 block mb-1">Провайдер</label>
          <p className="text-[10px] text-gray-400 mb-1.5">OpenAI использует внешний API. Ollama идёт через локально развернутую модель на твоём сервере.</p>
          <select
            value={params.provider}
            onChange={(e) => {
              const nextProvider = e.target.value as AIParams['provider'];
              setParam('provider', nextProvider);
              setParam('model', getDefaultModelForProvider(nextProvider));
            }}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {AVAILABLE_PROVIDERS.map((provider) => (
              <option key={provider} value={provider}>
                {PROVIDER_LABELS[provider] ?? provider}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Модель</label>
          <p className="text-[10px] text-gray-400 mb-1.5">
            {params.provider === 'openai'
              ? 'Для OpenAI в списке показаны цены за 1M токенов (вход/выход).'
              : 'Локальная модель вызывается через Ollama-compatible API и не показывает API-cost в интерфейсе.'}
          </p>
          <select
            value={params.model}
            onChange={(e) => setParam('model', e.target.value)}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {availableModels.map((m) => (
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
            max={16384}
            value={params.maxTokens}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 1 && v <= 16384) {
                setParam('maxTokens', v);
              }
            }}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Context Limit */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-700">Лимит контекста</label>
            <span className="text-xs font-mono text-gray-500">
              {params.contextLimit === 0 ? 'Авто' : `${(params.contextLimit / 1000).toFixed(0)}K`}
            </span>
          </div>
          <p className="text-[10px] text-gray-400 mb-1.5">
            Ограничение контекста диалога. 0 = используется весь контекст модели ({((MODEL_CONTEXT_SIZES[params.model] || 128000) / 1000).toFixed(0)}K).
          </p>
          <input
            type="range"
            min={0}
            max={MODEL_CONTEXT_SIZES[params.model] || 128000}
            step={1000}
            value={params.contextLimit}
            onChange={(e) => setParam('contextLimit', parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>Авто</span>
            <span>{((MODEL_CONTEXT_SIZES[params.model] || 128000) / 2000).toFixed(0)}K</span>
            <span>{((MODEL_CONTEXT_SIZES[params.model] || 128000) / 1000).toFixed(0)}K</span>
          </div>
        </div>

        {/* Context Strategy */}
        <div className="border-t border-gray-200 pt-4">
          <label className="text-xs font-medium text-gray-700 block mb-2">Стратегия контекста</label>
          {isContextStrategyLocked ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-1 rounded bg-gray-100 text-gray-500 font-medium">
                {STRATEGY_LABELS[contextStrategyValue] || contextStrategyValue}
              </span>
              <span className="text-[10px] text-gray-400">Зафиксирована после первого сообщения</span>
            </div>
          ) : (
            <StrategySelector
              value={contextStrategyValue}
              onChange={onChangeContextStrategy}
            />
          )}

          {/* sliding_window settings */}
          {contextStrategyValue === 'sliding_window' && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">Хранить последних</label>
                <span className="text-xs font-mono text-gray-500">{params.slidingWindowKeepLast} сообщ.</span>
              </div>
              <p className="text-[10px] text-gray-400 mb-1.5">Сколько последних сообщений хранить. Остальные отбрасываются.</p>
              <input
                type="range"
                min={2}
                max={50}
                step={2}
                value={params.slidingWindowKeepLast}
                onChange={(e) => setParam('slidingWindowKeepLast', parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>2</span>
                <span>26</span>
                <span>50</span>
              </div>
            </div>
          )}

          {/* sticky_facts info */}
          {contextStrategyValue === 'sticky_facts' && (
            <p className="text-[10px] text-gray-400 mt-2">
              AI извлекает ключевые факты из диалога и отправляет их вместе с последними сообщениями
            </p>
          )}
        </div>

        {/* RAG */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 block">RAG</label>
              <p className="text-[10px] text-gray-400 mt-1">
                Если включён, бэкенд попытается подмешать релевантные фрагменты из проиндексированного корпуса сообщений
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={params.ragEnabled}
              onClick={() => setParam('ragEnabled', !params.ragEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                params.ragEnabled ? 'bg-emerald-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  params.ragEnabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {params.ragEnabled && (
            <div className="mt-3">
              <label className="text-xs font-medium text-gray-700 block mb-1">Режим отбора</label>
              <p className="text-[10px] text-gray-400 mb-2">
                Режим `Reranker` использует отдельную модель ранжирования. Режим `Фильтр` применяет встроенную эвристику релевантности.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['filter', 'reranker'] as const).map((mode) => {
                  const isActive = params.ragMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setParam('ragMode', mode)}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        isActive
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className="block text-xs font-semibold">{RAG_MODE_LABELS[mode]}</span>
                      <span className="block mt-1 text-[10px] opacity-80">
                        {mode === 'reranker'
                          ? 'Отдельная модель пересортировывает найденные кандидаты'
                          : 'Кодовый фильтр отсеивает и переупорядочивает фрагменты'}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-700 block">Query rewrite</label>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Перед поиском бэкенд перепишет запрос в более поисковую формулировку, не меняя сам пользовательский вопрос для ответа
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={params.ragQueryRewriteEnabled}
                    onClick={() => setParam('ragQueryRewriteEnabled', !params.ragQueryRewriteEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      params.ragQueryRewriteEnabled ? 'bg-emerald-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        params.ragQueryRewriteEnabled ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Repetition Penalty */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-700">Штраф за повторы</label>
            <span className="text-xs font-mono text-gray-500">{params.repetitionPenalty.toFixed(1)}</span>
          </div>
          <p className="text-[10px] text-gray-400 mb-1.5">Штраф за повторы. 0 — без штрафа, положительные — меньше повторов, отрицательные — больше повторов.</p>
          <input
            type="range"
            min={-2}
            max={2}
            step={0.1}
            value={params.repetitionPenalty}
            onChange={(e) => setParam('repetitionPenalty', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>-2</span>
            <span>0</span>
            <span>2</span>
          </div>
        </div>

        {/* System Prompt */}
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
