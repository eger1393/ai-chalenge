'use client';

import { useState } from 'react';
import { Bug, ChevronDown, ChevronRight, Clock, Coins, Hash, Cpu, CheckCircle2, XCircle, FileText } from 'lucide-react';
import { MessageDebugData } from '@/types/conversation';

interface DebugPanelProps {
  debugData: MessageDebugData;
}

const STEP_LABELS: Record<string, string> = {
  planning: 'Планирование',
  execution: 'Выполнение',
  validation: 'Валидация',
};

const STEP_COLORS: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  planning: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: 'text-amber-500' },
  execution: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: 'text-indigo-500' },
  validation: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', icon: 'text-violet-500' },
};

const STRATEGY_LABELS: Record<string, string> = {
  sliding_window: 'Скользящее окно',
  sticky_facts: 'Факты',
  branching: 'Ветки',
  pipeline: 'Pipeline',
};

const LAYER_CONFIG = {
  long_term: { label: 'Долговременная', emoji: '🧠', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  working: { label: 'Рабочая', emoji: '📋', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  short_term: { label: 'Краткосрочная', emoji: '💬', bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}мс`;
  return `${(ms / 1000).toFixed(1)}с`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// ── Collapsible Section ───────────────────────────────────────────────

function Section({ title, icon, children, defaultOpen = false }: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1.5 py-2 text-left group"
      >
        {icon}
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex-1">{title}</span>
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        }
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

// ── Stat Pill ─────────────────────────────────────────────────────────

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-md">
      {icon}
      <span className="text-[10px] text-gray-500">{label}</span>
      <span className="text-[11px] font-mono font-medium text-gray-700">{value}</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────

export function DebugPanel({ debugData }: DebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const toggleLayer = (i: number) => {
    setExpandedLayers(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };
  const toggleStep = (i: number) => {
    setExpandedSteps(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };

  const isPipeline = debugData.strategyType === 'pipeline' && debugData.pipelineData;

  return (
    <div className="ml-11 mt-1.5">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
      >
        <Bug className="w-3.5 h-3.5" />
        Debug
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>

      {open && (
        <div className="border border-gray-200 rounded-xl bg-white shadow-sm mt-1.5 max-w-2xl overflow-hidden">
          <div className="px-4 py-3 space-y-0">

            {/* ── Strategy badge ────────────────────────────────────── */}
            <div className="flex items-center gap-2 pb-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-medium">
                {STRATEGY_LABELS[debugData.strategyType] || debugData.strategyType || '—'}
              </span>
              {debugData.contextMessagesCount > 0 && (
                <span className="text-[11px] text-gray-500">
                  {debugData.contextMessagesCount} → {debugData.contextMessagesAfterTruncation} сообщ.
                  {debugData.contextMessagesCount > debugData.contextMessagesAfterTruncation && (
                    <span className="text-red-400 ml-1">
                      (-{debugData.contextMessagesCount - debugData.contextMessagesAfterTruncation})
                    </span>
                  )}
                </span>
              )}
            </div>

            {/* ── Pipeline Section ──────────────────────────────────── */}
            {isPipeline && debugData.pipelineData && (
              <Section title="Pipeline этапы" icon={<Cpu className="w-3.5 h-3.5 text-indigo-400" />} defaultOpen>
                {/* Summary stats */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <Stat
                    icon={<Hash className="w-3 h-3 text-gray-400" />}
                    label="Попыток"
                    value={String(debugData.pipelineData.totalAttempts)}
                  />
                  <Stat
                    icon={<Coins className="w-3 h-3 text-gray-400" />}
                    label="Стоимость"
                    value={`$${debugData.pipelineData.totalCost.toFixed(4)}`}
                  />
                  <Stat
                    icon={<Hash className="w-3 h-3 text-gray-400" />}
                    label="Токены"
                    value={formatTokens(debugData.pipelineData.totalTokens)}
                  />
                </div>

                {/* Step cards */}
                <div className="space-y-2">
                  {debugData.pipelineData.steps.map((step, i) => {
                    const colors = STEP_COLORS[step.stepType] || STEP_COLORS.planning;
                    const isExpanded = expandedSteps.has(i);
                    const isValidation = step.stepType === 'validation';
                    const totalTokens = step.promptTokens + step.completionTokens;

                    return (
                      <div key={i} className={`rounded-lg border ${colors.border} overflow-hidden`}>
                        <button
                          type="button"
                          onClick={() => toggleStep(i)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left ${colors.bg} hover:opacity-90 transition-opacity`}
                        >
                          {/* Step icon */}
                          {isValidation ? (
                            step.validationPassed
                              ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                              : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          ) : (
                            <FileText className={`w-4 h-4 ${colors.icon} flex-shrink-0`} />
                          )}

                          {/* Name + attempt */}
                          <span className={`text-xs font-semibold ${colors.text} flex-1`}>
                            {STEP_LABELS[step.stepType] || step.stepType}
                            {step.attempt > 1 && (
                              <span className="ml-1.5 text-[10px] font-normal opacity-70">попытка #{step.attempt}</span>
                            )}
                          </span>

                          {/* Meta pills */}
                          <div className="flex items-center gap-2 text-[10px] font-mono opacity-75">
                            <span className={colors.text}>{step.model}</span>
                            <span className={colors.text}>{formatTokens(totalTokens)} tok</span>
                            <span className={colors.text}>${step.cost.toFixed(4)}</span>
                            <span className={`flex items-center gap-0.5 ${colors.text}`}>
                              <Clock className="w-2.5 h-2.5" />
                              {formatDuration(step.durationMs)}
                            </span>
                          </div>

                          {isExpanded
                            ? <ChevronDown className={`w-4 h-4 ${colors.icon} flex-shrink-0`} />
                            : <ChevronRight className={`w-4 h-4 ${colors.icon} flex-shrink-0`} />
                          }
                        </button>

                        {isExpanded && (
                          <div className="px-3 py-2 bg-white border-t border-gray-100">
                            {/* Token breakdown */}
                            <div className="flex gap-4 text-[10px] text-gray-500 mb-2 font-mono">
                              <span>prompt: {step.promptTokens.toLocaleString()}</span>
                              <span>completion: {step.completionTokens.toLocaleString()}</span>
                            </div>

                            {/* Validation reason */}
                            {step.validationReason && (
                              <div className={`text-xs rounded-md px-2.5 py-1.5 mb-2 ${
                                step.validationPassed
                                  ? 'bg-green-50 text-green-700 border border-green-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}>
                                <span className="font-medium">{step.validationPassed ? 'Результат:' : 'Причина отказа:'}</span>{' '}
                                {step.validationReason}
                              </div>
                            )}

                            {/* Content */}
                            {step.content && (
                              <div className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed max-h-52 overflow-y-auto rounded-md bg-gray-50 p-2.5 border border-gray-100">
                                {step.content}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* ── Memory Layers ─────────────────────────────────────── */}
            {debugData.memoryLayers && debugData.memoryLayers.length > 0 && (
              <Section title="Слои памяти">
                <div className="space-y-1.5">
                  {debugData.memoryLayers.map((layer, i) => {
                    const cfg = LAYER_CONFIG[layer.type];
                    const isExpanded = expandedLayers.has(i);
                    return (
                      <div key={i} className={`rounded-lg border ${cfg.border} overflow-hidden`}>
                        <button
                          type="button"
                          onClick={() => layer.content && toggleLayer(i)}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 ${cfg.bg} ${layer.content ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                          <span className={`text-[11px] font-medium ${cfg.text}`}>
                            {cfg.emoji} {cfg.label}
                          </span>
                          <span className={`text-[11px] font-mono ${cfg.text} opacity-70`}>{layer.tokenCount} tok</span>
                          <span className={`text-[11px] ${cfg.text} truncate flex-1 text-left opacity-70`}>{layer.label}</span>
                          {layer.content && (isExpanded
                            ? <ChevronDown className={`w-3.5 h-3.5 ${cfg.text} flex-shrink-0`} />
                            : <ChevronRight className={`w-3.5 h-3.5 ${cfg.text} flex-shrink-0`} />
                          )}
                        </button>
                        {isExpanded && layer.content && (
                          <div className={`px-3 py-2 text-[11px] font-mono ${cfg.text} whitespace-pre-wrap break-words border-t ${cfg.border} bg-white`}>
                            {layer.content}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* ── Token Breakdown ───────────────────────────────────── */}
            {debugData.tokenBreakdown && Object.keys(debugData.tokenBreakdown).length > 0 && (
              <Section title="Токены">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(debugData.tokenBreakdown).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-md border border-gray-100">
                      <span className="text-[10px] text-gray-500">{key}</span>
                      <span className="text-[11px] font-mono font-medium text-gray-700">{typeof val === 'number' ? val.toLocaleString() : val}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ── Facts ─────────────────────────────────────────────── */}
            {debugData.strategyType === 'sticky_facts' && (
              <Section title="Факты">
                <div className="space-y-2">
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">До ответа:</div>
                    {debugData.factsSnapshot && debugData.factsSnapshot.length > 0 ? (
                      <div className="space-y-0.5">
                        {debugData.factsSnapshot.map((fact, i) => (
                          <div key={i} className="text-[11px] font-mono px-2 py-0.5 bg-gray-50 rounded">
                            <span className="text-teal-600 font-medium">{fact.key}</span>
                            <span className="text-gray-400 mx-1">=</span>
                            <span className="text-gray-700">{fact.value}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-gray-400 italic">(пусто)</div>
                    )}
                  </div>
                  {debugData.factsAfter && (
                    <div>
                      <div className="text-[11px] text-gray-500 mb-1">После извлечения:</div>
                      {debugData.factsAfter.length > 0 ? (
                        <div className="space-y-0.5">
                          {debugData.factsAfter.map((fact, i) => (
                            <div key={i} className="text-[11px] font-mono px-2 py-0.5 bg-gray-50 rounded">
                              <span className="text-emerald-600 font-medium">{fact.key}</span>
                              <span className="text-gray-400 mx-1">=</span>
                              <span className="text-gray-700">{fact.value}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-gray-400 italic">(пусто)</div>
                      )}
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* ── Strategy Metadata ─────────────────────────────────── */}
            {debugData.strategyMetadata && Object.keys(debugData.strategyMetadata).length > 0 && !isPipeline && (
              <Section title="Детали стратегии">
                <div className="space-y-1">
                  {Object.entries(debugData.strategyMetadata)
                    .filter(([key]) => key !== 'factsSnapshot')
                    .map(([key, val]) => (
                      <div key={key} className="flex items-baseline gap-2 text-[11px]">
                        <span className="text-gray-500 min-w-[100px]">{key}</span>
                        <span className="font-mono text-gray-700 break-all">
                          {typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)}
                        </span>
                      </div>
                    ))}
                </div>
              </Section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
