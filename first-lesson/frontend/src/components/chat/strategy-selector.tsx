'use client';

import { Layers, Brain } from 'lucide-react';
import { ContextStrategyType, STRATEGY_LABELS } from '@/types/ai-params';

interface StrategySelectorProps {
  value: ContextStrategyType;
  onChange: (v: ContextStrategyType) => void;
  disabled?: boolean;
}

const STRATEGIES: { type: ContextStrategyType; icon: typeof Layers; description: string }[] = [
  { type: 'sliding_window', icon: Layers, description: 'Старые сообщения заменяются краткой сводкой, последние хранятся дословно' },
  { type: 'sticky_facts', icon: Brain, description: 'Ключевые факты извлекаются и хранятся отдельно от истории сообщений' },
];

export function StrategySelector({ value, onChange, disabled }: StrategySelectorProps) {
  const currentStrategy = STRATEGIES.find((s) => s.type === value) || STRATEGIES[0];

  return (
    <div>
      <div className={`flex rounded-lg overflow-hidden border border-gray-300 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
        {STRATEGIES.map((strategy) => {
          const Icon = strategy.icon;
          const isActive = value === strategy.type;
          return (
            <button
              key={strategy.type}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onChange(strategy.type)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {STRATEGY_LABELS[strategy.type]}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-1.5">{currentStrategy.description}</p>
    </div>
  );
}
