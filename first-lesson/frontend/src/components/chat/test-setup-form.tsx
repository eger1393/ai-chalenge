'use client';

import { useState } from 'react';
import { FlaskConical } from 'lucide-react';

interface TestSetupFormProps {
  onStart: (topic: string, pairsCount: number) => void;
  isGenerating: boolean;
}

export function TestSetupForm({ onStart, isGenerating }: TestSetupFormProps) {
  const [topic, setTopic] = useState('');
  const [pairsCount, setPairsCount] = useState(10);

  const handleSubmit = () => {
    if (topic.trim() && !isGenerating) {
      onStart(topic.trim(), pairsCount);
    }
  };

  return (
    <div className="flex items-center justify-center h-full px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4 mx-auto">
          <FlaskConical className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">
          Тестирование стратегий
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Сгенерируйте диалог и проверьте поведение контекстных стратегий
        </p>

        <div className="space-y-4 text-left">
          {/* Topic */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Тема диалога
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value.slice(0, 500))}
              placeholder="Например: обсуждение архитектуры микросервисов"
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
            />
            <div className="text-[10px] text-gray-400 mt-0.5 text-right">
              {topic.length}/500
            </div>
          </div>

          {/* Pairs count slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">
                Длина диалога
              </label>
              <span className="text-sm font-mono text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                {pairsCount} пар
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={50}
              value={pairsCount}
              onChange={(e) => setPairsCount(Number(e.target.value))}
              className="w-full accent-amber-600"
            />
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>5</span>
              <span>50</span>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!topic.trim() || isGenerating}
            className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl py-3 text-sm transition-colors"
          >
            {isGenerating ? 'Генерация...' : 'Сгенерировать диалог'}
          </button>
        </div>
      </div>
    </div>
  );
}
