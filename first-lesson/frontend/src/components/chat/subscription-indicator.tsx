'use client';

import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { IssueSubscription } from '@/types/notification';

interface SubscriptionIndicatorProps {
  subscriptions: IssueSubscription[];
}

function computeTtl(createdAt: string, expiresAt: string): { percent: number; label: string; color: string } {
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const expires = new Date(expiresAt).getTime();
  const total = expires - created;
  const remaining = Math.max(0, expires - now);

  if (total <= 0) return { percent: 0, label: 'истекла', color: 'bg-red-500' };

  const percent = Math.min(100, (remaining / total) * 100);

  // Format label
  const remainingMin = Math.floor(remaining / 60_000);
  let label: string;
  if (remainingMin <= 0) {
    label = 'истекла';
  } else if (remainingMin < 60) {
    label = `${remainingMin}м`;
  } else {
    const h = Math.floor(remainingMin / 60);
    const m = remainingMin % 60;
    label = m > 0 ? `${h}ч ${String(m).padStart(2, '0')}м` : `${h}ч`;
  }

  let color: string;
  if (percent > 50) {
    color = 'bg-teal-500';
  } else if (percent > 25) {
    color = 'bg-amber-500';
  } else {
    color = 'bg-red-500';
  }

  return { percent, label, color };
}

export function SubscriptionIndicator({ subscriptions }: SubscriptionIndicatorProps) {
  const [, setTick] = useState(0);

  const active = subscriptions.filter((s) => s.isActive);

  // Update TTL every 60 seconds
  useEffect(() => {
    if (active.length === 0) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, [active.length]);

  if (active.length === 0) return null;

  return (
    <div className="flex-shrink-0 border-b border-gray-100">
      <div className="flex items-center gap-3 px-4 py-1.5">
        {/* Summary */}
        <div className="flex items-center gap-1.5 text-xs text-teal-600">
          <Bell className="w-3.5 h-3.5" />
          <span className="font-medium">{active.length} подпис{active.length === 1 ? 'ка' : active.length < 5 ? 'ки' : 'ок'}</span>
        </div>

        {/* Subscription items */}
        <div className="flex items-center gap-3 flex-1 overflow-x-auto min-w-0">
          {active.map((sub) => {
            const ttl = computeTtl(sub.createdAt, sub.expiresAt);
            return (
              <div key={sub.id} className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[11px] font-mono text-gray-600 truncate max-w-[140px]">
                  {sub.repository}
                </span>
                {/* TTL progress bar */}
                <div className="flex items-center gap-1.5">
                  <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${ttl.color} rounded-full transition-all duration-300`}
                      style={{ width: `${ttl.percent}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{ttl.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
