'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { AppliedParams, ExpertOpinion } from '@/types/ai-params';
import { AppliedParamsDisplay } from './applied-params-display';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  appliedParams?: AppliedParams;
  expertOpinions?: ExpertOpinion[];
  isConsilium?: boolean;
}

export function MessageBubble({ role, content, error, appliedParams, expertOpinions, isConsilium }: MessageBubbleProps) {
  if (role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[70%] px-4 py-3 bg-indigo-600 text-white rounded-2xl rounded-tr-sm text-sm leading-relaxed">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <AppliedParamsDisplay appliedParams={appliedParams} />
      {isConsilium && expertOpinions && expertOpinions.length > 0 && (
        <ExpertOpinionsAccordion opinions={expertOpinions} />
      )}
      <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
        </svg>
      </div>
      <div className="max-w-[70%]">
        {isConsilium && (
          <div className="text-[10px] text-indigo-600 font-medium mb-1">Синтез консилиума</div>
        )}
        <div
          className={`px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap ${
            error
              ? 'bg-red-50 text-red-600 border border-red-200'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {content}
        </div>
      </div>
      </div>
    </div>
  );
}

function ExpertOpinionsAccordion({ opinions }: { opinions: ExpertOpinion[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="ml-11 mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Мнения экспертов ({opinions.length})
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {opinions.map((opinion, i) => (
            <div
              key={i}
              className={`border rounded-lg p-3 text-xs ${
                opinion.error
                  ? 'border-red-200 bg-red-50'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="font-medium text-gray-700 mb-1">{opinion.expert}</div>
              <div className={`whitespace-pre-wrap leading-relaxed ${opinion.error ? 'text-red-600' : 'text-gray-600'}`}>
                {opinion.reply}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
