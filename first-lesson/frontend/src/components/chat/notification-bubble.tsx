'use client';

import { Bell, ExternalLink, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { IssueNotification } from '@/types/notification';

interface NotificationBubbleProps {
  notification: IssueNotification;
  onMarkRead?: (id: string) => void;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин. назад`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} ч. назад`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD} дн. назад`;
}

export function NotificationBubble({ notification, onMarkRead }: NotificationBubbleProps) {
  const { issueNumber, issueTitle, issueUrl, issueAuthor, summary, isRead, createdAt, id } = notification;

  // Extract repo from issueUrl (e.g. https://github.com/owner/repo/issues/1)
  let repoName = '';
  try {
    const parts = new URL(issueUrl).pathname.split('/');
    if (parts.length >= 3) {
      repoName = `${parts[1]}/${parts[2]}`;
    }
  } catch {
    repoName = '';
  }

  return (
    <div className={`mb-4 flex items-start gap-3 ${isRead ? 'opacity-75' : ''}`}>
      {/* Bell icon in teal circle */}
      <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Bell className="w-4 h-4 text-teal-600" />
      </div>

      {/* Content */}
      <div className="max-w-[75%] min-w-0">
        <div className="bg-teal-50 border border-teal-200 rounded-2xl rounded-tl-sm px-4 py-3">
          {/* Header */}
          <div className="flex items-center flex-wrap gap-2 mb-2">
            {repoName && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-100 text-teal-700 border border-teal-200">
                {repoName}
              </span>
            )}
            <span className="text-[11px] text-gray-500">{formatTimestamp(createdAt)}</span>
          </div>

          {/* Issue title + link */}
          <a
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-900 hover:underline mb-1.5"
          >
            <span>#{issueNumber} {issueTitle}</span>
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>

          {issueAuthor && (
            <div className="text-[11px] text-gray-500 mb-2">
              Автор: <span className="font-medium text-gray-600">{issueAuthor}</span>
            </div>
          )}

          {/* AI Summary (Markdown) */}
          {summary && (
            <div className="text-sm text-gray-700 leading-relaxed prose prose-sm prose-teal max-w-none [&_a]:text-teal-600 [&_a:hover]:text-teal-800 [&_a]:underline [&_p]:mb-1 [&_ul]:mb-1 [&_ol]:mb-1 [&_li]:mb-0">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children, ...props }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                      {children}
                    </a>
                  ),
                }}
              >
                {summary}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Mark as read button */}
        {!isRead && onMarkRead && (
          <button
            type="button"
            onClick={() => onMarkRead(id)}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-teal-600 mt-1 ml-1 transition-colors"
          >
            <Check className="w-3 h-3" />
            Прочитано
          </button>
        )}
      </div>
    </div>
  );
}
