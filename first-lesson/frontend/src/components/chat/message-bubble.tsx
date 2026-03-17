import { AppliedParams } from '@/types/ai-params';
import { AppliedParamsDisplay } from './applied-params-display';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  appliedParams?: AppliedParams;
}

export function MessageBubble({ role, content, error, appliedParams }: MessageBubbleProps) {
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
      <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
        </svg>
      </div>
      <div
        className={`max-w-[70%] px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap ${
          error
            ? 'bg-red-50 text-red-600 border border-red-200'
            : 'bg-gray-100 text-gray-800'
        }`}
      >
        {content}
      </div>
      </div>
    </div>
  );
}
